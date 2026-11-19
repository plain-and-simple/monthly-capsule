import {
  SAMPLE_KICKER,
  SAMPLE_MONTH,
  SAMPLE_ONE_LETTER,
  SAMPLE_ONE_NAME,
  SAMPLE_TWO_LETTER,
  SAMPLE_TWO_NAME,
} from "@/lib/copy";

/** Static home-page object. Names and sentences are fiction. */
export function SampleSpread() {
  return (
    <figure className="sample">
      <figcaption className="sample__kicker">{SAMPLE_KICKER}</figcaption>
      <div className="sample__sheet">
        <p className="sample__month serif">{SAMPLE_MONTH}</p>
        <div className="sample__grid">
          <div className="sample__letter">
            <p className="sample__name">{SAMPLE_ONE_NAME}</p>
            <p className="serif">{SAMPLE_ONE_LETTER}</p>
          </div>
          <div className="sample__photo" role="img" aria-label="Sample photo" />
          <div className="sample__letter sample__letter--wide">
            <p className="sample__name">{SAMPLE_TWO_NAME}</p>
            <p className="serif">{SAMPLE_TWO_LETTER}</p>
          </div>
        </div>
      </div>
    </figure>
  );
}
