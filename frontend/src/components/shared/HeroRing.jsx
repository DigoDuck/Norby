import darkRing from "@/assets/brand/hero-ring-dark.webp";
import lightRing from "@/assets/brand/hero-ring-light.webp";

export default function HeroRing({ className = "" }) {
  return (
    <div aria-hidden="true" className={`hero-ring ${className}`}>
      <div data-hero-caustic="true" className="hero-ring__caustic" />
      <img
        data-ring-theme="dark"
        className="hero-ring__asset hero-ring__asset--dark"
        src={darkRing}
        alt=""
        draggable="false"
      />
      <img
        data-ring-theme="light"
        className="hero-ring__asset hero-ring__asset--light"
        src={lightRing}
        alt=""
        draggable="false"
      />
    </div>
  );
}
