// Users as the server returns them (openapi.yaml, User schema): never a password.
export const hiker = {
  id: 1,
  firstName: 'Hannah',
  lastName: 'Hiker',
  email: 'hiker@example.com',
  phone: '+393401234567',
  role: 'hiker',
};
export const employee = { ...hiker, id: 2, firstName: 'Eric', email: 'employee@example.com', role: 'employee' };
export const warden = { ...hiker, id: 3, firstName: 'Wendy', email: 'warden@example.com', role: 'warden' };
