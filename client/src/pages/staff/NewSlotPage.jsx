// MH-02 FE2 – New slot form (staff only). The form allows staff to create a new slot with a date, start and end time,
// label, and a list of tables. The form validates the input and displays errors for missing or invalid fields.
// Staff can also copy the table layout from nearby slots. Upon submission, the form sends a POST request to create
// the new slot and navigates back to the slots week view.
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Form from 'react-bootstrap/Form';
import { createSlot, listSlots } from '../../api/slots.js';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import FormField from '../../components/FormField.jsx';
import Loading from '../../components/Loading.jsx';
import { useFormErrors } from '../../hooks/useFormErrors.js';
import { addDays, formatDate, formatTimeRange, startOfWeek, toLocalIsoDate } from '../../utils/format.js';
import { routes } from '../../routes.js';
import './NewSlotPage.css';

const makeTable = () => ({ name: '', seats: '' });

/** Monday ('YYYY-MM-DD') of the week of a 'YYYY-MM-DD' date, or null when the text is not a date. */
function weekOf(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate ?? '')) return null;
  const [year, month, day] = isoDate.split('-').map(Number);
  return toLocalIsoDate(startOfWeek(new Date(year, month - 1, day)));
}

/** The week view of the week of `isoDate`, or the current week when there is no date. */
function weekViewUrl(isoDate) {
  const week = weekOf(isoDate);
  return week ? `${routes.staffSlots}?week=${week}` : routes.staffSlots;
}

function validateSlotForm({ values, tables }) {
  const errors = {};
  if (!values.date) errors.date = 'Date is required';
  if (!values.startTime) errors.startTime = 'Start time is required';
  if (!values.endTime) errors.endTime = 'End time is required';
  if (!values.label.trim()) errors.label = 'Label is required';
  if (values.startTime && values.endTime && values.endTime <= values.startTime) {
    errors.endTime = 'End time must be after start time';
  }
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const nowText = `${toLocalIsoDate(now)}T${hours}:${minutes}`;
  if (values.date && values.startTime && `${values.date}T${values.startTime}` <= nowText) {
    errors.startTime = 'The slot must start in the future';
  }

  const seenNames = new Set();
  tables.forEach((table, index) => {
    const name = table.name.trim();
    if (!name) errors[`tableName-${index}`] = 'Table name is required';
    else if (seenNames.has(name)) errors[`tableName-${index}`] = 'Table names must be unique';
    seenNames.add(name);

    const seats = Number(table.seats);
    if (!Number.isInteger(seats) || seats < 1) errors[`seats-${index}`] = 'At least one seat is required';
  });
  return errors;
}

export default function NewSlotPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [values, setValues] = useState({
    date: searchParams.get('date') || '',
    startTime: '',
    endTime: '',
    label: '',
  });
  const [tables, setTables] = useState([makeTable()]);
  const [nearbySlots, setNearbySlots] = useState([]);
  const [loadingNearbySlots, setLoadingNearbySlots] = useState(true);
  const [copyError, setCopyError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const formValues = { values, tables };
  const fieldIds = {
    date: 'slot-date',
    startTime: 'slot-start-time',
    endTime: 'slot-end-time',
    label: 'slot-label',
    ...tables.reduce((ids, _table, index) => ({
      ...ids,
      [`tableName-${index}`]: `table-name-${index}`,
      [`seats-${index}`]: `table-seats-${index}`,
    }), {}),
  };
  const {
    errors,
    setErrors,
    generalError,
    generalRef,
    checkOnSubmit,
    recheck,
    showGeneralError,
  } = useFormErrors(validateSlotForm, fieldIds);

  // Fetch nearby slots for copying tables when the component mounts.
  useEffect(() => {
    let cancelled = false;
    // TODO: choose the appropriate range of nearby slots
    const from = toLocalIsoDate(addDays(new Date(), -15));
    const to = toLocalIsoDate(addDays(new Date(), 15));
    listSlots(from, to)
      .then((slots) => {
        if (!cancelled) {
          setNearbySlots(slots);
          setLoadingNearbySlots(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCopyError(error.message);
          setLoadingNearbySlots(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Calculate total capacity based on the current tables.
  const capacity = tables.reduce((total, table) => {
    const seats = Number(table.seats);
    return total + (Number.isInteger(seats) && seats > 0 ? seats : 0);
  }, 0);

  function updateValue(event) {
    const { name, value } = event.target;
    const nextValues = { ...values, [name]: value };
    setValues(nextValues);
    if (Object.keys(errors).length) setErrors(validateSlotForm({ values: nextValues, tables }));
  }

  function updateTable(index, field, value) {
    const nextTables = tables.map((table, tableIndex) =>
      tableIndex === index ? { ...table, [field]: value } : table
    );
    setTables(nextTables);
    if (Object.keys(errors).length) setErrors(validateSlotForm({ values, tables: nextTables }));
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting || !checkOnSubmit(formValues)) return;

    setSubmitting(true);
    try {
      const created = await createSlot({
        ...values,
        label: values.label.trim(),
        tables: tables.map(({ name, seats }) => ({ name: name.trim(), seats: Number(seats) })),
      });
      navigate(weekViewUrl(values.date), { state: { created } });
    } catch (error) {
      showGeneralError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  function copyTables(event) {
    const selected = nearbySlots.find((slot) => String(slot.id) === event.target.value);
    if (selected) {
      const nextTables = selected.tables.map(({ name, seats }) => ({ name, seats: String(seats) }));
      setTables(nextTables);
      if (Object.keys(errors).length) setErrors(validateSlotForm({ values, tables: nextTables }));
    }
  }

  function addTable() {
    const nextTables = [...tables, makeTable()];
    setTables(nextTables);
    if (Object.keys(errors).length) setErrors(validateSlotForm({ values, tables: nextTables }));
  }

  function removeTable(index) {
    const nextTables = tables.filter((_, tableIndex) => tableIndex !== index);
    setTables(nextTables);
    if (Object.keys(errors).length) setErrors(validateSlotForm({ values, tables: nextTables }));
  }

  return (
    <>
      <title>New slot – Mountain Hut</title>
      <h1>New slot</h1>
      <ErrorMessage message={generalError} ref={generalRef} />
      <Card>
        <Card.Body>
          <Form noValidate onSubmit={submit}>
            <FormField
              id="slot-date"
              name="date"
              type="date"
              label="Date"
              value={values.date}
              onChange={updateValue}
              onBlur={() => recheck('date', formValues)}
              error={errors.date}
              min={toLocalIsoDate(new Date())}
              required
            />
            <div className="row">
              <div className="col-md-6">
                <FormField
                  id="slot-start-time"
                  name="startTime"
                  type="time"
                  label="Start time"
                  value={values.startTime}
                  onChange={updateValue}
                  onBlur={() => recheck('startTime', formValues)}
                  error={errors.startTime}
                  required
                />
              </div>
              <div className="col-md-6">
                <FormField
                  id="slot-end-time"
                  name="endTime"
                  type="time"
                  label="End time"
                  value={values.endTime}
                  onChange={updateValue}
                  onBlur={() => recheck('endTime', formValues)}
                  error={errors.endTime}
                  required
                />
              </div>
            </div>
            <FormField
              id="slot-label"
              name="label"
              label="Label"
              value={values.label}
              onChange={updateValue}
              onBlur={() => recheck('label', formValues)}
              error={errors.label}
              required
            />

            <h2 className="h3">Tables</h2>
            <Form.Group>
              <Form.Group controlId="copy-tables" className="mh-copy-tables-box p-3 mb-4">
                <Form.Label>Copy tables from</Form.Label>
                <Form.Select defaultValue="" onChange={copyTables}>
                  <option value="">Choose a slot</option>
                  {nearbySlots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {formatDate(slot.date)} – {slot.label} ({formatTimeRange(slot.startTime, slot.endTime)})
                    </option>
                  ))}
                </Form.Select>
                {loadingNearbySlots && <Loading />}
                <ErrorMessage message={copyError} />
              </Form.Group>

              {tables.map((table, index) => (
                <div className="mh-table-box p-3 mb-3" key={index}>
                  <div className="row align-items-start">
                    <div className="col-md-6">
                      <FormField
                        id={`table-name-${index}`}
                        label="Table name"
                        value={table.name}
                        onChange={(event) => updateTable(index, 'name', event.target.value)}
                        onBlur={() => recheck(`tableName-${index}`, formValues)}
                        error={errors[`tableName-${index}`]}
                        required
                      />
                    </div>
                    <div className="col-md-4">
                      <FormField
                        id={`table-seats-${index}`}
                        label="Seats"
                        type="number"
                        min="1"
                        value={table.seats}
                        onChange={(event) => updateTable(index, 'seats', event.target.value)}
                        onBlur={() => recheck(`seats-${index}`, formValues)}
                        error={errors[`seats-${index}`]}
                        required
                      />
                    </div>
                    <div className="col-md-2 align-self-center">
                      <Button
                        type="button"
                        variant="outline-danger"
                        className="w-100"
                        aria-label={`Remove table ${index + 1}`}
                        disabled={tables.length === 1}
                        onClick={() => removeTable(index)}
                      >
                        Remove table
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </Form.Group>
            <div className="mb-3">
              <Button  
                type="button"
                variant="outline-primary"
                className="d-inline-flex align-items-center gap-1"
                onClick={addTable}
              >
                <Plus aria-hidden="true" size={18} />
                Add table
              </Button>
            </div>
            <p>Total capacity: {capacity} {capacity === 1 ? 'seat' : 'seats'}</p>

            <div className="d-flex justify-content-end gap-3">
              <Button
                type="button"
                variant="outline-primary"
                disabled={submitting}
                onClick={() => navigate(weekViewUrl(searchParams.get('date')))}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create slot'}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </>
  );
}
