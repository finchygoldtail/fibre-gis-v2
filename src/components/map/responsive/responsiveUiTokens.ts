import React from "react";

export const responsiveTouch = {
  minTarget: 44,
  comfortableTarget: 48,
};

export const responsiveZ = {
  toolbar: 1300,
  mobileOverlay: 2200,
  mobileMenu: 2600,
  modal: 9800,
};

export const responsiveMotion = {
  fast: "160ms ease",
  standard: "220ms ease",
  sheet: "280ms cubic-bezier(0.2, 0.8, 0.2, 1)",
};

export const responsiveSafeArea = {
  top: "env(safe-area-inset-top, 0px)",
  bottom: "env(safe-area-inset-bottom, 0px)",
  left: "env(safe-area-inset-left, 0px)",
  right: "env(safe-area-inset-right, 0px)",
};

export const mobileButtonBase: React.CSSProperties = {
  minWidth: responsiveTouch.minTarget,
  minHeight: responsiveTouch.minTarget,
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
};

export const mobilePanelChrome: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.98)",
  border: "1px solid rgba(148,163,184,0.32)",
  boxShadow: "0 24px 70px rgba(0,0,0,0.46)",
};
