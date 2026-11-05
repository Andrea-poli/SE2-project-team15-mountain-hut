// Static texts of the home page (one hut only, confirmed by the PO; a change is a change request to the team, #28).
// The hut and the places around it are invented for the project. Data only, no markup.
export const hut = {
  name: 'Mountain Hut', // also the h1 the E2E smoke test looks for
  tagline:
    'A stone hut at 2,180 m in the upper Val Serena, open all year: ' +
    'hot meals, a warm room and a view over the glacier.',
  description:
    "The hut stands on the grassy shoulder of Colle dell'Aquila, where the trail from the valley meets the high " +
    'routes. It has a dining room with shared tables, dormitories and a winter room that is always open. ' +
    'The warden and the team cook with local products: polenta, mountain cheeses and soups, with vegetarian ' +
    'dishes every day. Meals are served in turns at lunch and dinner, so booking a table ahead is the best way ' +
    'to be sure of a seat.',
  location:
    "Colle dell'Aquila, 2,180 m, at the head of Val Serena in the western Alps. The hut faces south, above " +
    "Lago Bianco, with the Punta dell'Aquila (2,790 m) behind it. There is no road: the hut can only be " +
    'reached on foot.',
  gettingThere:
    'Drive to the car park of Pian Grande (1,520 m), at the end of the Val Serena road (on summer weekends also ' +
    'by bus from Borgo Serena). From there follow trail no. 12: 2 h 15 min, 660 m of ascent, easy (E). ' +
    'In winter the same trail is marked for snowshoes: check the avalanche bulletin before leaving and, if in ' +
    'doubt, call the hut on +39 0175 123 456.',
  // Each item: { name, description, walkingTimeMin } (minutes on foot from the hut)
  pointsOfInterest: [
    {
      name: 'Belvedere delle Marmotte',
      description: 'a short walk to a viewpoint where marmots are easy to see',
      walkingTimeMin: 15,
    },
    { name: 'Lago Bianco', description: 'a glacial lake below the hut, good for a picnic', walkingTimeMin: 25 },
    { name: 'Alpe Fontana', description: "old stone shepherds' huts, still used in summer", walkingTimeMin: 40 },
    {
      name: "Punta dell'Aquila",
      description: 'the summit above the hut, with a view of the whole valley; path EE, the last part on rocks',
      walkingTimeMin: 105,
    },
  ],
};
