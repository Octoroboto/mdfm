/* Optional live weather for MDFM (opt-in: this is the only part of MDFM that touches the network).
   Uses Open-Meteo (free, no API key). Pass it in: createMDFM({ weather: openMeteo({ lat, lon, place }) })
   or openMeteo({ place: "Chicago", auto: true }) to use the device location (needs geolocation permission). */
const CODES={0:"clear",1:"mostly clear",2:"partly cloudy",3:"overcast",45:"foggy",48:"foggy",51:"drizzling",53:"drizzling",55:"drizzling",61:"raining",63:"raining",65:"pouring",66:"freezing rain",67:"freezing rain",71:"snowing",73:"snowing",75:"snowing hard",77:"snowing",80:"showery",81:"showery",82:"pouring",85:"snowing",86:"snowing hard",95:"thunderstorming",96:"thunderstorming with hail",99:"thunderstorming with hail"};
export function openMeteo(o = {}) {
  const units = o.units === "c" ? "celsius" : "fahrenheit", wind = o.units === "c" ? "kmh" : "mph";
  const where = () => o.lat != null ? Promise.resolve({ lat: o.lat, lon: o.lon }) :
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
