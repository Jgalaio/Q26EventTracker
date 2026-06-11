import type { AppLogo } from "./app-settings";

type TopbarBrandProps = {
  logo: AppLogo | null;
  title: string;
};

export function TopbarBrand({ logo, title }: TopbarBrandProps) {
  return (
    <div className="topbar-brand">
      {logo?.dataUrl ? (
        <img alt="Logo Q26" className="topbar-logo" src={logo.dataUrl} />
      ) : (
        <span className="topbar-logo-fallback">Q26</span>
      )}
      <h1>{title}</h1>
    </div>
  );
}
