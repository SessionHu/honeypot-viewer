import L from 'leaflet';
import '@elfalem/leaflet-curve';

interface StatusRes {
  args: string,
  cpu: string,
  ip: string,
  lport: number,
  rport: number,
  pid: string,
  rss: string,
  time: string,
  more: {
    addr: string,
    city: string,
    country: string,
    isp: string,
    latitude: number | string,
    longitude: number | string,
  }
};

/**
 * Server location
 */
const SERVER_LOC: [number, number] = [22.362482, 114.119047];

export class HoneypotMap {
  #map: L.Map;
  #curveLayer: L.LayerGroup;

  constructor(containerId: string) {
    // init msp
    this.#map = L.map(containerId, {
      center: SERVER_LOC,
      //worldCopyJump: true,
      zoom: 2,
      maxBounds: L.latLngBounds(
        [-90, SERVER_LOC[1] - 180 - 45],
        [90, SERVER_LOC[1] + 180 + 45]
      ),
      fadeAnimation: true,
    }).setView(SERVER_LOC, 2);

    // tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'/*'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'*/, {
      maxZoom: 19,
      minZoom: 2,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | &copy; <a href="https://carto.com/attributions">CARTO</a> | &copy; SESS.DN42 <a href="https://github.com/SessionHu/honeypot-viewer">Honeypot Viewer</a>',
      detectRetina: true,
      updateWhenIdle: true,
    }).addTo(this.#map);
    // layer for curve and bot markers
    this.#curveLayer = L.layerGroup().addTo(this.#map);
    // server marker
    L.marker(SERVER_LOC, {
      icon: honeyIcon
    }).bindPopup('HoneyPot Central \u{1f36f}').addTo(this.#map);
  }

  /**
   * Draw dashed curve between two points
   */
  private drawCurve(from: [number, number], to: [number, number]) {
    // calc control point
    const midLat = (from[0] + to[0]) / 2;
    const midLng = (from[1] + to[1]) / 2;
    // offset
    const cp: [number, number] = [
      midLat + (to[1] - from[1]) * 0.1, 
      midLng - (to[0] - from[0]) * 0.1
    ];
    // draw
    const pathData = ['M', from, 'Q', cp, to];
    const curve = L.curve(pathData as any, {
      color: '#ffc0cb',
      weight: 4,
      opacity: .9,
      fill: false,
      dashArray: '4, 8', // 漂亮的呼吸虚线效果
      animate: { duration: 2000, iterations: Infinity } // 部分版本支持原生动画
    });
    this.#curveLayer.addLayer(curve);
  }

  /**
   * Draw curve and points
   */
  public renderBots(bots: Array<StatusRes>) {
    this.#curveLayer.clearLayers();
    for (const bot of bots) {
			bot.more.longitude = Number(bot.more.longitude);
			bot.more.latitude = Number(bot.more.latitude);
      if (isNaN(bot.more.longitude) || isNaN(bot.more.latitude)) continue;
      // the Earth is not flat
      if (Math.abs(bot.more.longitude - SERVER_LOC[1]) > 180) {
        if (bot.more.longitude > SERVER_LOC[1]) bot.more.longitude -= 360;
        else bot.more.longitude += 360;
      }
      // draw
      const elem = document.createElement('pre');
      elem.textContent = JSON.stringify(bot, null, 2);
      L.circleMarker([
        bot.more.latitude, bot.more.longitude
      ], { radius: 3, color: '#ffc0cb' }).bindPopup(elem).addTo(this.#curveLayer);
      this.drawCurve(SERVER_LOC, [
        bot.more.latitude, bot.more.longitude
      ]);
    }
  }
}

const honeyIcon = L.divIcon({
  html: '<span style="font-size: 24px; line-height: 1;">&#x1f36f;</span>',
  className: 'honeypot-icon', // clear default styles
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

// init
const myApp = new HoneypotMap('map');
// add data
(async function cb() {
  try {
    myApp.renderBots(await (await fetch('/cgi-bin/status')).json());
    setTimeout(cb, 2.4e5); // refresh each 4min
  } catch (e) {
    console.error(e);
    setTimeout(cb, 1e3); // retry immediately
  }
})();
