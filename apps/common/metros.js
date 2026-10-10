// Big-league metro areas: centre point and the "location" names ESPN uses for their teams.
// Used to turn "where the Mac is" into "which teams are local". Nearest metro within 160 km wins.
const METROS = [
  ["Atlanta", 33.75, -84.39, ["Atlanta"]], ["Baltimore", 39.29, -76.61, ["Baltimore"]], ["Boston", 42.36, -71.06, ["Boston", "New England"]],
  ["Buffalo", 42.89, -78.88, ["Buffalo"]], ["Charlotte", 35.23, -80.84, ["Charlotte", "Carolina"]], ["Chicago", 41.88, -87.63, ["Chicago"]],
  ["Cincinnati", 39.10, -84.51, ["Cincinnati"]], ["Cleveland", 41.50, -81.69, ["Cleveland"]], ["Columbus", 39.96, -83.00, ["Columbus"]],
  ["Dallas", 32.78, -96.80, ["Dallas", "Texas"]], ["Denver", 39.74, -104.99, ["Denver", "Colorado"]], ["Detroit", 42.33, -83.05, ["Detroit"]],
  ["Green Bay", 44.51, -88.01, ["Green Bay"]], ["Houston", 29.76, -95.37, ["Houston"]], ["Indianapolis", 39.77, -86.16, ["Indiana", "Indianapolis"]],
  ["Jacksonville", 30.33, -81.66, ["Jacksonville"]], ["Kansas City", 39.10, -94.58, ["Kansas City"]], ["Las Vegas", 36.17, -115.14, ["Las Vegas", "Vegas"]],
  ["Los Angeles", 34.05, -118.24, ["Los Angeles", "LA", "Anaheim"]], ["Miami", 25.76, -80.19, ["Miami", "Florida"]],
  ["Milwaukee", 43.04, -87.91, ["Milwaukee"]], ["Minneapolis", 44.98, -93.27, ["Minnesota"]], ["Nashville", 36.16, -86.78, ["Nashville", "Tennessee"]],
  ["New Orleans", 29.95, -90.07, ["New Orleans"]], ["New York", 40.71, -74.01, ["New York", "Brooklyn", "New Jersey"]],
  ["Oklahoma City", 35.47, -97.52, ["Oklahoma City"]], ["Orlando", 28.54, -81.38, ["Orlando"]], ["Philadelphia", 39.95, -75.17, ["Philadelphia"]],
  ["Phoenix", 33.45, -112.07, ["Phoenix", "Arizona"]], ["Pittsburgh", 40.44, -79.99, ["Pittsburgh"]], ["Portland", 45.52, -122.68, ["Portland"]],
  ["Sacramento", 38.58, -121.49, ["Sacramento"]], ["Salt Lake City", 40.76, -111.89, ["Utah", "Real Salt Lake"]], ["San Antonio", 29.42, -98.49, ["San Antonio"]],
  ["San Diego", 32.72, -117.16, ["San Diego"]], ["San Francisco", 37.77, -122.42, ["San Francisco", "Golden State", "San Jose", "Oakland"]],
  ["Seattle", 47.61, -122.33, ["Seattle"]], ["St. Louis", 38.63, -90.20, ["St. Louis"]], ["Tampa", 27.95, -82.46, ["Tampa Bay"]],
  ["Toronto", 43.65, -79.38, ["Toronto"]], ["Washington", 38.91, -77.04, ["Washington"]], ["Raleigh", 35.78, -78.64, ["Carolina"]],
  ["Montreal", 45.50, -73.57, ["Montreal", "CF Montréal"]], ["Vancouver", 49.28, -123.12, ["Vancouver"]], ["Calgary", 51.05, -114.07, ["Calgary"]],
  ["Edmonton", 53.55, -113.49, ["Edmonton"]], ["Winnipeg", 49.90, -97.14, ["Winnipeg"]], ["Ottawa", 45.42, -75.70, ["Ottawa"]],
];
function km(a, b, c, d) { const r = x => x * Math.PI / 180, R = 6371; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function nearestMetro(lat, lon, maxKm = 160) {
  let best = null; for (const [name, a, b, locs] of METROS) { const d = km(lat, lon, a, b); if (!best || d < best.km) best = { name, km: d, locations: locs }; }
  return best && best.km <= maxKm ? best : null;
}
module.exports = { METROS, nearestMetro, km };
