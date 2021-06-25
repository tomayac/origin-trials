const fetch = require("node-fetch");
const path = require("path");

// Require the fastify framework and instantiate it
const fastify = require("fastify")({
  logger: true
});

const xmlEscape = string => {
  if (!string) return;
  return string
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/&/g, "&amp;");
};

const getChromeVersions = async () => {
  const versions = await fetch(
    "https://versionhistory.googleapis.com/v1/chrome/platforms/win/channels/dev/versions/all/releases?filter=channel%3C=dev,fraction=1"
  ).then(response => response.json());
  const versionLookup = {};
  versions.releases
    .filter(version => version.fraction === 1)
    .map(version => {
      const truncated = version.version.split(".")[0];
      if (!versionLookup[truncated]) {
        versionLookup[truncated] = new Date(version.serving.startTime);
      } else {
        const existingDate = versionLookup[truncated];
        const newDate = new Date(version.serving.startTime);
        if (newDate < existingDate) {
          versionLookup[truncated] = newDate;
        }
      }
    });
  return versionLookup;
};

const toRSS = (data, status, versions) => {
  status = status.toLowerCase();
  return `<?xml version="1.0" encoding="UTF-8" ?>
  <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
    <channel>
      <title>Origin Trials (${status})</title>
      <description>All ${status} Chrome Origin Trials</description>
      <link>https://origin-trials.glitch.me/${status}</link> 
      <atom:link href="https://origin-trials.glitch.me/${status}" rel="self" type="application/rss+xml" />
      <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <ttl>720</ttl>
      ${data
        .sort((a, b) => new Date(b.endTime) - new Date(a.endTime))
        .map(
          item => `
        <item>
          <title>${xmlEscape(item.displayName)}</title>
          <description><![CDATA[
            <p>${xmlEscape(item.description)}</p>
            <ul>
              <li>Documentation: <a class="docs" href="${xmlEscape(
                item.documentationUrl
              )}">${xmlEscape(item.documentationUrl)}</a></li>
              <li>Intent to Experiment: <a class="i2e" href="${xmlEscape(
                item.intentToExperimentUrl
              )}">${xmlEscape(item.intentToExperimentUrl)}</a></li>
              <li>ChromeStatus: <a class="chromestatus" href="${xmlEscape(
                xmlEscape(item.chromestatusUrl)
              )}">${xmlEscape(
            xmlEscape(item.chromestatusUrl)
          )}</a></li>              
              <li>From: <span class="from">${
                item.startMilestone
              }</span> (${new Date(
            versions[item.startMilestone]
          ).toUTCString()})</li>
              <li>To: <span class="to">${item.endMilestone}</span> (${new Date(
            item.endTime
          ).toUTCString()})</li>
              <li>Status: ${item.status}</li>
            </ul>
          ]]></description>
          <link>https://developer.chrome.com/origintrials/#/view_trial/${
            item.id
          }</link>
          <guid isPermaLink="false">${item.id}</guid>
          <pubDate>${new Date(
            versions[item.startMilestone]
          ).toUTCString()}</pubDate>
        </item>`
        )
        .join("")}
    </channel>
  </rss>`;
};

const getOTs = async (filter, raw = false) => {
  const versions = await getChromeVersions();
  return fetch(
    "https://content-chromeorigintrials-pa.googleapis.com/v1/trials?prettyPrint=false&key=AIzaSyDNwqPBcgaOul_h00xdxbIlOFiNUYyZCl8",
    {
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9,de;q=0.8",
        "cache-control": "no-cache",
        pragma: "no-cache",
        "sec-ch-ua":
          '" Not A;Brand";v="99", "Chromium";v="90", "Google Chrome";v="90"',
        "sec-ch-ua-mobile": "?0",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-goog-encode-response-if-executable": "base64",
        "x-javascript-user-agent": "google-api-javascript-client/1.1.0",
        "x-origin": "https://developer.chrome.com",
        "x-referer": "https://developer.chrome.com",
        "x-requested-with": "XMLHttpRequest"
      },
      referrer:
        "https://content-chromeorigintrials-pa.googleapis.com/static/proxy.html?usegapi=1&jsh=m%3B%2F_%2Fscs%2Fapps-static%2F_%2Fjs%2Fk%3Doz.gapi.en.gnwtWNvUGcY.O%2Fam%3DAQ%2Fd%3D1%2Fct%3Dzgms%2Frs%3DAGLTcCP6AkYbdIi7zNVG6LbV1_mXrObMOA%2Fm%3D__features__",
      referrerPolicy: "strict-origin-when-cross-origin",
      body: null,
      method: "GET",
      mode: "cors"
    }
  )
    .then(response => response.json())
    .then(data => {
      if (raw) {
        return data;
      }
      if (filter) {
        return toRSS(
          data.trials.filter(trial => trial.status === filter),
          filter,
          versions
        );
      }
      return toRSS(data.trials, "", versions);
    });
};

fastify.get("/", async function(request, reply) {
  reply.type("application/rss+xml").code(200);
  reply.send(await getOTs());
});

fastify.get("/active", async function(request, reply) {
  reply.type("application/rss+xml").code(200);
  reply.send(await getOTs("ACTIVE"));
});

fastify.get("/complete", async function(request, reply) {
  reply.type("application/rss+xml").code(200);
  reply.send(await getOTs("COMPLETE"));
});

fastify.get("/raw", async function(request, reply) {
  reply.type("application/json").code(200);
  reply.send(await getOTs(false, true));
});


fastify.listen(process.env.PORT, function(err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`server listening on ${address}`);
});
