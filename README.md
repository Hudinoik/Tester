# Minyanim SA – Restored
- Public homepage: distance sort, time/type filters, favourites, open-in-maps, copy address
- Admin: wide Users card, Add Shul, My Shuls list + editor (name/address/area and times)
- Gabai: manage multiple shuls; times load via /shuls/:id/full
- After saving times, homepage shows them (fetch busts cache with ?ts=timestamp)

Deploy: `cd backend && npm install` then `cd backend && npm start`. Env vars: SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, optional DB_PATH.
