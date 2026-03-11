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
 * 核心配置：主人的服务器坐标 (中心点)
 * 假设服务器在比利时 (Google Cloud e2-google 常用区域)
 */
const SERVER_LOC: [number, number] = [45.5946, -121.1787];

export class HoneypotMap {
  private map: L.Map;
  private curveLayer: L.LayerGroup;

  constructor(containerId: string) {
    // 1. 初始化地图，使用 OSM 默认视角
    this.map = L.map(containerId, {
      center: SERVER_LOC,
      //worldCopyJump: true,
      zoom: 2,
      maxBounds: L.latLngBounds(
        [-90, SERVER_LOC[1] - 180 - 45],
        [90, SERVER_LOC[1] + 180 + 45]
      )
    }).setView(SERVER_LOC, 2);

    // 2. 使用 OSM 官方瓦片 (标准、自由、兼容性最强喵！)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      minZoom: 2,
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);

    // 3. 准备一个图层组专门放曲线，方便以后批量刷新喵
    this.curveLayer = L.layerGroup().addTo(this.map);

    // 4. 标记主人神圣不可侵犯的服务器喵！
    this.serverMarker = L.marker(SERVER_LOC, {
      icon: honeyIcon
    }).bindPopup('HoneyPot Central \u{1f36f}').addTo(this.map);
  }

  serverMarker: L.Marker;

  /**
   * 绘制带弧度的虚线曲线喵
   */
  private drawCurve(from: [number, number], to: [number, number]) {
    // 计算控制点 (让线弯曲的魔法喵)
    const midLat = (from[0] + to[0]) / 2;
    const midLng = (from[1] + to[1]) / 2;
    
    // 简单的垂直偏移逻辑，让线条更有张力
    const cp: [number, number] = [
      midLat + (to[1] - from[1]) * 0.1, 
      midLng - (to[0] - from[0]) * 0.1
    ];

    const pathData = ['M', from, 'Q', cp, to];

    // 使用 leaflet-curve (注意：由于类型定义可能不全，这里用了 any 喵)
    const curve = L.curve(pathData as any, {
      color: '#00ffcc',
      weight: 4,
      opacity: 0.6,
      fill: false,
      dashArray: '4, 8', // 漂亮的呼吸虚线效果
      animate: { duration: 2000, iterations: Infinity } // 部分版本支持原生动画
    });

    this.curveLayer.addLayer(curve);
  }

  /**
   * 批量渲染肉鸡连线喵
   */
  public renderBots(bots: Array<StatusRes>) {
    this.curveLayer.clearLayers();
    bots.filter(b => b.more.longitude !== void 0 && b.more.latitude !== void 0).forEach(bot => {
      // 如果经度跨度太大，就手动调整经度，让它往“另一边”连线喵
      if (Math.abs(bot.more.longitude - SERVER_LOC[1]) > 180) {
        if (bot.more.longitude > SERVER_LOC[1]) bot.more.longitude -= 360;
        else bot.more.longitude += 360;
      }
      // 在肉鸡位置画个小点
      const elem = document.createElement('pre');
			elem.textContent = JSON.stringify(bot, null, 2);
      L.circleMarker([
        bot.more.latitude, bot.more.longitude
      ], { radius: 3, color: '#00ffcc' }).bindPopup(elem).addTo(this.curveLayer);
      // 连线到服务器
      this.drawCurve(SERVER_LOC, [
        bot.more.latitude, bot.more.longitude
      ]);
    });
  }
}

const honeyIcon = L.divIcon({
  html: '<span style="font-size: 24px; line-height: 1;">&#x1f36f;</span>',
  className: 'honeypot-icon', // 清除默认样式
  iconSize: [30, 30],
  iconAnchor: [15, 15] // 锚点设在中心
});

// 初始化应用喵！
const myApp = new HoneypotMap('map');
(async function cb() {
  const json: StatusRes[] = await (await fetch('/cgi-bin/status')).json();
  myApp.renderBots(json);
  setTimeout(cb, 2.4e5);
})();
