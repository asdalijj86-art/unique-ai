// Leaflet ships no bundled types and @types/leaflet is not installed
// (MapWidget already carried the one TS7016 for this import). This
// ambient declaration covers both map usages (MapWidget +
// WorldMonitor) with `any` types — the runtime behaviour is
// unchanged, Leaflet is a real dependency (leaflet ^1.9.4). The
// namespace form matters: a bare `declare module 'leaflet';` makes
// `L.Map` / `L.Marker` type references fail, this one keeps them.
declare module 'leaflet' {
  namespace L {
    type Map = any;
    type Marker = any;
    type TileLayer = any;
    type DivIcon = any;
    function map(el: any, opts?: any): Map;
    function tileLayer(url: string, opts?: any): TileLayer;
    function marker(ll: any, opts?: any): Marker;
    function divIcon(opts?: any): DivIcon;
  }
  export = L;
}
