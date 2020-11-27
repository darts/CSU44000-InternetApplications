const API_KEY = process.env.WEATHER_API_KEY;
if (!API_KEY)
    process.exit(1);
const API_BASE_URL = "https://api.openweathermap.org/data/2.5/forecast";
const SERVER_PORT = 5501;
const DEFAULT_UNITS = "metric";

const app = require("express")();
const axios = require("axios").default;
const cors = require("cors");

app.use(cors());//Allow cross origin requests

function getWeatherForLocation(location) {
    return axios.get(API_BASE_URL, {
        params: {
            q: location,
            APPID: API_KEY,
            units: DEFAULT_UNITS
        }
    })
        .then(res => res.data)
        .catch(err => err.response);
}

app.get("/5dayweather", (req, res) => {
    getWeatherForLocation(req.query.location)
        .then(weatherRes => {
            if (weatherRes.data?.message) { //send error message if there is one
                res.json({ error: weatherRes.data.message.charAt(0).toUpperCase() + weatherRes.data.message.slice(1) });
            } else {
                weatherRes = weatherRes.list.map(element => { //reorder and send the data
                    return {
                        timeString: element.dt_txt,
                        temp: Math.round(element.main.temp),
                        rain: element.rain?.["3h"] ?? 0,
                        wind: element.wind
                    };
                });
                res.json({ weather: weatherRes });
            }
        });
});

app.listen(SERVER_PORT, () => console.log(`Server running on port: ${SERVER_PORT}`));