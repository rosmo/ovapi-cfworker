export default {
	async fetch(request, env, ctx) {
		// ovapi.nl has an invalid certificate for now
		let data = "";
		const headers = {
			"X-Source": "Cloudflare-Workers",
			"User-agent": "ovapi-cfworker/1.0.0 taneli_at_taneli_nl",
			"Cache-Control": "no-cache",
		};
		try {
			data = await loadData(env.LINES, headers);

			if (env.ovstops_weather !== undefined && env.WEATHER_LAT !== undefined && env.WEATHER_LON !== undefined) {
				let forecast = null;
				let cachedForecast = await env.ovstops_weather.get("weather");
				cachedForecast = null;
				if (cachedForecast !== null) {
					try {
						forecast = JSON.parse(cachedForecast);
					} catch (e) {
						cachedForecast = null;
					}
				}
				if (cachedForecast === null) {
					forecast = await loadWeather(env.WEATHER_ID, parseFloat(env.WEATHER_LAT), parseFloat(env.WEATHER_LON), headers);
					await env.ovstops_weather.put("weather", JSON.stringify(forecast), { expirationTtl: 60*15 });
				}
				if (forecast !== null) {
					data["weather"] = forecast;
				} 
			}
			return new Response(JSON.stringify(data));
		} catch (error) {
			return new Response(error + "\n" + error.stack + "\nData was: " + data);
		}
	},
};

async function loadWeather(stationId, lat, lon, headers) {
	const rainUrl = "https://gpsgadget.buienradar.nl/data/raintext/?lat=" + lat + "&lon=" + lon;	 
	const rainData = await fetch(rainUrl, {
		headers: headers,
	});

	// Calculation borrowed from: https://github.com/WeeJeWel/node-buienradar/blob/master/lib/Buienradar.js
	let dataText = await rainData.text();
	let dataLines = dataText.split('\n');
	let [ mmh, time ] = dataLines[0].trim().split('|');
	mmh = parseFloat(mmh);
	let mmhC = Math.pow(10, (mmh-109)/32);
	let forecast = { "time": time, "date": new Date().toString(), "mmh": mmhC, "original": mmh };

	const statusUrl = "https://data.buienradar.nl/2.0/feed/json";
	const statusData = await fetch(statusUrl, {
		headers: new Map([headers, { "Accept": "application/json" }]),
	});

	let dataJson = await statusData.json();
	const fields = ["regio", "stationname", "winddirection", "weatherdescription", "airpressure", "temperature", "feeltemperature", "windspeed", "windgusts", "winddirectiondegrees"];
	for (const station of dataJson["actual"]["stationmeasurements"]) {
		if (station["stationid"] == stationId) {
			for (const [key, value] of Object.entries(station)) {
				if (fields.includes(key)) {
					forecast[key] = value;
				}
			}
		}
	}
	return forecast;
}

async function loadData(lines, headers) {
	const linesSplit = lines.split(",");
	let linesToFetch = [];
	let stopsForLines = {};
	for (const line of linesSplit) {
		const ls = line.split("=", 2);
		linesToFetch.push(ls[0]);
		stopsForLines[ls[0]] = ls[1];
	}
	console.log("Fetching: " + "http://v0.ovapi.nl/line/" + linesToFetch.join(","));
	const data = await fetch("http://v0.ovapi.nl/line/" + linesToFetch.join(","), {
		headers: new Map([headers, { "Accept": "application/json" }]),
	});
	if (!data.ok) {
		throw new Error("Failed fetching URL: " + tripData.status + "\nResponse was: " + tripData.text());
	}
	const json = await data.json();
	let stopNames = {};
	let tripCandidates = [];
	for (const k in json) {
		if (json[k].hasOwnProperty("Actuals")) {
			const actuals = json[k]["Actuals"];
			for (const ak in actuals) {
				const trip = actuals[ak];
				stopNames[trip["TimingPointCode"]] = trip["TimingPointName"];
				if (["DRIVING", "PLANNED"].includes(trip["TripStopStatus"])) {
					tripCandidates.push(ak);
				}
			}
		}
		if (json[k].hasOwnProperty("Network")) {
			const network = json[k]["Network"];
			for (const nk in network) {
				for (const nkk in network[nk]) {
					if (network[nk][nkk].hasOwnProperty("TimingPointName")) {
						stopNames[network[nk][nkk]["TimingPointCode"]] = network[nk][nkk]["TimingPointName"];
					}
				}
			}
		}
	}
	console.log("Fetching: " + "http://v0.ovapi.nl/journey/" + tripCandidates.join(","));
	const tripData = await fetch("http://v0.ovapi.nl/journey/" + tripCandidates.join(","), {
		headers: new Map([headers, { "Accept": "application/json" }]),
	});
	if (!tripData.ok) {
		throw new Error("Failed fetching URL: " + tripData.status + "\nResponse was: " + tripData.text());
	}
	const tripJson = await tripData.json();
	let journeys = {};
	for (const k in tripJson) {
		if (tripJson[k].hasOwnProperty("Stops")) {
			const stops = tripJson[k]["Stops"];
			for (const sk in stops) {
				const lineId = stops[sk]["OperatorCode"] + "_" + stops[sk]["LinePlanningNumber"] + "_" + stops[sk]["LineDirection"];
				if (stops[sk].hasOwnProperty("TimingPointCode") && stops[sk]["TimingPointCode"] == stopsForLines[lineId]) {
					const timeTarget = Date.parse(stops[sk]["TargetArrivalTime"]);
					const timeEstimated = Date.parse(stops[sk]["ExpectedArrivalTime"]);
					const timeDifference = timeEstimated - timeTarget;
					const stopInfo = {
						"line_no": stops[sk]["LinePublicNumber"],
						"line": stops[sk]["LineName"],
						"destination": stops[sk]["DestinationName50"],
						"transport": stops[sk]["TransportType"],
						"stop": stopNames[stops[sk]["TimingPointCode"]],
						"status": stops[sk]["TripStopStatus"],
						"time_target": timeTarget,
						"time_estimated": timeEstimated,
						"time_diff": timeDifference,
					};
					if (!journeys.hasOwnProperty(lineId)) {
						journeys[lineId] = [];
					}
					journeys[lineId].push(stopInfo);
				}
			}
		}
	}
	for (const jk in journeys) {
		journeys[jk].sort(function (a, b) {
			if (a["time_target"] < b["time_target"]) {
				return -1;
			} else if (a["time_target"] > b["time_target"]) {
				return 1;
			}
			return 0;
		});
	}
	return journeys;
}

