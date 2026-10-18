// Edit this list if your destination names differ from the destinationID saved in Scenarios_tbl
export const DESTS = ["Our Lady of Lourdes Grotto", "Mt. Balagbag", "Padre Pio"];
export const MAX_EXTRA = 3;      // reserve waypoints per destination
export const TERM_MONTHS = 6;    // how long a student account stays valid after approval

// Names of the stops (the "Stop Title" on each TourStop in Unity), shown as suggestions when an instructor writes a Stop story.
// Instructors can still type any name; it must match the game's wood sign. Add your stops here.
export const STOPS = {
    // One entry per question, in the order students meet them. "" = this question has no stop name yet (shown as "Question N").
    "Our Lady of Lourdes Grotto": ["the statue", "the bridge", "GROTTO BUILDING", "", ""],   // 3 outside + 2 inside the Grotto
    "Mt. Balagbag": ["", "balagbag resort", "", "", ""],
    "Padre Pio": []
};
// The most questions a map asks (extra questions beyond this are never used by the game)
export const MAX_SLOTS = { "Mt. Balagbag": 5 };
