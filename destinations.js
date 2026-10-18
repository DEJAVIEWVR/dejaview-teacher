// Edit this list if your destination names differ from the destinationID saved in Scenarios_tbl
export const DESTS = ["Our Lady of Lourdes Grotto", "Mt. Balagbag", "Padre Pio"];
export const MAX_EXTRA = 3;      // reserve waypoints per destination
export const TERM_MONTHS = 6;    // how long a student account stays valid after approval

// Names of the stops (the "Stop Title" on each TourStop in Unity), shown as suggestions when an instructor writes a Stop story.
// Instructors can still type any name; it must match the game's wood sign. Add your stops here.
export const STOPS = {
    // One entry per question, in the order students meet them. "" = this question has no stop name yet (shown as "Question N").
    "Our Lady of Lourdes Grotto": ["the statue", "the bridge", "GROTTO BUILDING", "", ""],   // 3 outside + 2 inside the Grotto
    "Mt. Balagbag": ["INN", "balagbag resort", "rock picture spot", "rock picture spot 2", "peak"],   // the 5 stops that ask a question
    "Padre Pio": []
};
// The most questions a map asks (extra questions beyond this are never used by the game)
export const MAX_SLOTS = { "Our Lady of Lourdes Grotto": 5, "Mt. Balagbag": 5, "Padre Pio": 5 };
// EVERY stop in the order students visit it (stops that only teach history are included). Used for the Training Modules "Stop story" list.
// If a map is not listed here, the STOPS list above is used.
export const ALL_STOPS = {
    "Mt. Balagbag": ["INN", "balagbag resort", "mtbalagbagtrail", "rock picture spot", "rock picture spot 2", "peak", "stall"]   // mtbalagbagtrail and stall = history only, no question
};
// The real stop number of each question (for maps that also have history-only stops). Mt. Balagbag: stop 3 and stop 7 have no question.
export const STOP_NOS = { "Mt. Balagbag": [1, 2, 4, 5, 6] };
