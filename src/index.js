export default {
	async fetch(request, env, ctx) {
		let data = await loadData(env.LINES);
		return new Response(JSON.stringify(data));
	},
};

async function loadData(lines) {
	const headers = {
		"X-Source": "Cloudflare-Workers",
		"User-agent": "ovapi-cfworker/1.0.0 taneli_at_taneli_nl",
		"Accept": "application/json",
		"Cache-Control": "no-cache",
	};

	const linesSplit = lines.split(",");
	let linesToFetch = [];
	let stopsForLines = {};
	for (const line of linesSplit) {
		const ls = line.split("=", 2);
		linesToFetch.push(ls[0]);
		stopsForLines[ls[0]] = ls[1];
	}
	const data = await fetch("https://v0.ovapi.nl/line/" + linesToFetch.join(","), {
		headers: headers,
	});
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
	const tripData = await fetch("https://v0.ovapi.nl/journey/" + tripCandidates.join(","), {
		headers: headers,
	});
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

