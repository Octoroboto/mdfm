/* Optional live weather for MDFM (opt-in: this is the only part of MDFM that touches the network).
   Uses Open-Meteo (free, no API key). Pass it in: createMDFM({ weather: openMeteo({ lat, lon, place }) })
   or openMeteo({ place: "Chicago", auto: true }) to use the device location (needs geolocation permission). */
// Where it fits: scripts/build.mjs bundles this (its export becomes a plain function) and dist/mdfm.* export openMeteo.
// createMDFM({ weather }) or radio.setProviders({ weather }) in src/engine.js calls the returned function for Tabitha's
// weather segment; without it (or if it fails) the weather is made up.
// CODES: WMO weather code (Open-Meteo's weather_code) -> the words Tabitha says ("it's {cond}").
const CODES={0:"clear",1:"mostly clear",2:"partly cloudy",3:"overcast",45:"foggy",48:"foggy",51:"drizzling",53:"drizzling",55:"drizzling",61:"raining",63:"raining",65:"pouring",66:"freezing rain",67:"freezing rain",71:"snowing",73:"snowing",75:"snowing hard",77:"snowing",80:"showery",81:"showery",82:"pouring",85:"snowing",86:"snowing hard",95:"thunderstorming",96:"thunderstorming with hail",99:"thunderstorming with hail"};
// openMeteo(o): o = { lat, lon (a fixed location), auto (use the device location instead), place (the spoken place name),
// units ("c" for Celsius and km/h; anything else is Fahrenheit and mph) }.
// Returns an async function resolving to { temp, cond, wind, place }, or rejecting with no location or a failed request.
export function openMeteo(o = {}) {
  const units = o.units === "c" ? "celsius" : "fahrenheit", wind = o.units === "c" ? "kmh" : "mph";
  const where = () => o.lat != null ? Promise.resolve({ lat: o.lat, lon: o.lon }) :   // where(): the location: fixed lat/lon, or the device's (3 s timeout, a fix up to an hour old is fine), else rejects
    o.auto && typeof navigator !== "undefined" && navigator.geolocation ? new Promise((res, rej) => navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lon: p.coords.longitude }), rej, { timeout: 3000, maximumAge: 3600e3 })) :
    Promise.reject(new Error("no location"));
  return async () => {
    const { lat, lon } = await where();
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&temperature_unit=${units}&wind_speed_unit=${wind}`);
    if (!r.ok) throw new Error("weather " + r.status);
    const c = (await r.json()).current || {};
    return { temp: c.temperature_2m, cond: CODES[c.weather_code] || "doing something", wind: c.wind_speed_10m, place: o.place || "your area" };
  };
}
