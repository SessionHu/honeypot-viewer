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
    country_code: string,
    domain: string,
    idd_code: number,
    isp: string,
    latitude: number,
    longitude: number,
    region: string
  }
};

/**
 * Server location
 */
const SERVER_LOC: [number, number] = [45.5946, -121.1787];

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
      )
    }).setView(SERVER_LOC, 2);

    // tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      minZoom: 2,
      attribution: '© OpenStreetMap contributors',
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
      color: '#00ffcc',
      weight: 4,
      opacity: 0.6,
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
    bots.filter(b => b.more.longitude !== void 0 && b.more.latitude !== void 0).forEach(bot => {
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
      ], { radius: 3, color: '#00ffcc' }).bindPopup(elem).addTo(this.#curveLayer);
      this.drawCurve(SERVER_LOC, [
        bot.more.latitude, bot.more.longitude
      ]);
    });
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
  const json: StatusRes[] = await (await fetch('/cgi-bin/status')).json();
  myApp.renderBots(json);
  setTimeout(cb, 2.4e5); // refresh each 4min
})();
