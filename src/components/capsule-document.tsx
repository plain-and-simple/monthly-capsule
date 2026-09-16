import {
  layoutPersonSection,
  parseCapsuleTheme,
  plateLabel,
  type CapsuleTheme,
  type LetterBlock,
} from "@/lib/capsule-theme";
import type { CapsuleArchivePhoto } from "@/lib/capsule-archive";
import { initials } from "@/lib/group-status";

export type CapsuleViewPhoto = CapsuleArchivePhoto & { url: string | null };

export type CapsuleViewLetter = {
  key: string;
  preferred_name: string;
  body: string;
  photos: CapsuleViewPhoto[];
};

export function CapsuleDocument({
  theme,
  groupName,
  title,
  letters,
  missedPhrase,
}: {
  theme: CapsuleTheme | string | null | undefined;
  groupName: string;
  title: string;
  letters: CapsuleViewLetter[];
  missedPhrase: string;
}) {
  const resolved = parseCapsuleTheme(theme);
  const names = letters.map((letter) => letter.preferred_name);

  return (
    <article className={`capsule capsule--${resolved}`} data-theme={resolved}>
      <CapsuleCover theme={resolved} groupName={groupName} title={title} names={names} />

      {letters.length === 0 ? <p className="center muted">No letters this month.</p> : null}

      {letters.map((letter) => (
        <PersonSection key={letter.key} theme={resolved} letter={letter} />
      ))}

      <div className="capsule__colophon">
        <p>{missedPhrase}</p>
      </div>
    </article>
  );
}

function CapsuleCover({
  theme,
  groupName,
  title,
  names,
}: {
  theme: CapsuleTheme;
  groupName: string;
  title: string;
  names: string[];
}) {
  const contents =
    names.length > 0 ? (
      <ul className={`capsule__contents capsule__contents--${theme}`}>
        {names.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    ) : null;

  if (theme === "warm") {
    return (
      <header className="capsule__cover">
        <p className="capsule__ribbon">{title}</p>
        <h1 className="capsule__title">{groupName}</h1>
        <p className="capsule__cover-note">Letters and photographs, kept together.</p>
        {contents}
      </header>
    );
  }
  if (theme === "minimal") {
    return (
      <header className="capsule__cover">
        <p className="capsule__kicker">Capsule</p>
        <h1 className="capsule__title">{title}</h1>
        <p className="capsule__cover-note">{groupName}</p>
        {contents}
      </header>
    );
  }
  if (theme === "heritage") {
    return (
      <header className="capsule__cover">
        <div className="capsule__ornament" aria-hidden="true">
          ❧
        </div>
        <p className="capsule__kicker">A keepsake</p>
        <h1 className="capsule__title">{title}</h1>
        <p className="capsule__cover-note">{groupName}</p>
        {contents}
        <div className="capsule__ornament" aria-hidden="true">
          ❧
        </div>
      </header>
    );
  }

  return (
    <header className="capsule__cover">
      <p className="eyebrow">{groupName}</p>
      <h1 className="capsule__title">{title}</h1>
      {names.length > 0 ? (
        <p className="muted small">
          {names.length} {names.length === 1 ? "letter" : "letters"} from {names.join(", ")}
        </p>
      ) : null}
      {contents}
    </header>
  );
}

function PersonSection({ theme, letter }: { theme: CapsuleTheme; letter: CapsuleViewLetter }) {
  const layout =
    theme === "classic"
      ? "letter-then-photos"
      : theme === "warm"
        ? "photos-woven"
        : theme === "minimal"
          ? "text-then-strip"
          : "letter-then-plates";
  const photoByPath = new Map(letter.photos.map((photo) => [photo.storage_path, photo]));
  const blocks = layoutPersonSection(theme, letter);

  return (
    <section
      className={`letter letter--${theme}`}
      data-author={letter.preferred_name}
      data-layout={layout}
    >
      {blocks.map((block, index) => (
        <LetterBlockView
          key={`${letter.key}-${index}`}
          theme={theme}
          block={block}
          photoByPath={photoByPath}
        />
      ))}
    </section>
  );
}

function LetterBlockView({
  theme,
  block,
  photoByPath,
}: {
  theme: CapsuleTheme;
  block: LetterBlock;
  photoByPath: Map<string, CapsuleViewPhoto>;
}) {
  if (block.kind === "heading") {
    if (theme === "minimal" || theme === "heritage") {
      return <h2 className="letter__name">{block.name}</h2>;
    }
    return (
      <div className="letter__head">
        <span className="avatar">{initials(block.name)}</span>
        <div className="letter__name">{block.name}</div>
      </div>
    );
  }
  if (block.kind === "text") {
    return <p className="letter__text">{block.text}</p>;
  }
  if (block.kind === "gallery") {
    return (
      <div className={`letter__photos letter__photos--${block.variant}`}>
        {block.photos.map((photo) => (
          <ThemePhoto key={photo.storage_path} photo={photoByPath.get(photo.storage_path) ?? photo} />
        ))}
      </div>
    );
  }
  const photo = photoByPath.get(block.photo.storage_path) ?? block.photo;
  if (block.variant === "plate") {
    return (
      <figure className="letter__plate">
        <ThemePhoto photo={photo} />
        <figcaption>{plateLabel(block.plateIndex ?? 0)}</figcaption>
      </figure>
    );
  }
  return (
    <figure className="letter__photo letter__photo--weave">
      <ThemePhoto photo={photo} />
    </figure>
  );
}

function ThemePhoto({ photo }: { photo: CapsuleArchivePhoto & { url?: string | null } }) {
  if (!("url" in photo) || !photo.url) return null;
  return (
    <div className="photo">
      <img src={photo.url} alt="" width={photo.width} height={photo.height} />
    </div>
  );
}
