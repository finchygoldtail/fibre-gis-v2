import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    rotate?: boolean;
    touchRotate?: boolean;
    rotateControl?: boolean;
    bearing?: number;
  }

  interface Map {
    setBearing(bearing: number): this;
    getBearing(): number;
  }
}