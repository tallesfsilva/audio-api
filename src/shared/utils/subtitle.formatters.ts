// subtitle.formatters.ts

import { TranscriptionSegmentRow, SubtitleFormat } from "../types/subtitle.types";

// --------------------------------------------------------------------------
// Timestamp helpers
// --------------------------------------------------------------------------
export interface AssSubtitleStyle {
  // Font
  fontFamily: string;
  fontSize: number;

  // Text style
  bold: boolean;
  italic: boolean;
  underline: boolean;

  // Colors (Hex: #RRGGBB)
  textColor: string;
  outlineColor: string;
  backgroundColor: string;

  // Effects

  shadow: number;  // pixels
}


export const DEFAULT_ASS_STYLE: AssSubtitleStyle = {
  fontFamily: "Arial",
  fontSize: 48,

  bold: true,
  italic: false,
  underline: false,

  textColor: "#FFA500",
  outlineColor: "#000000",
  backgroundColor: "#000000",

  shadow: 1,
};

function toSrtTimestamp(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(millis, 3)}`;
}

function toVttTimestamp(seconds: number): string {
  // VTT is identical to SRT except uses "." instead of "," for ms separator
  return toSrtTimestamp(seconds).replace(",", ".");
}

function toAssTimestamp(seconds: number): string {
  // ASS format: H:MM:SS.cs (centiseconds, not milliseconds)
  const cs = Math.round(seconds * 100);
  const h = Math.floor(cs / 360_000);
  const m = Math.floor((cs % 360_000) / 6_000);
  const s = Math.floor((cs % 6_000) / 100);
  const centis = cs % 100;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${h}:${pad(m)}:${pad(s)}.${pad(centis)}`;
}

function hexToAssColor(hex: string): string {
  const clean = hex.replace("#", "");

  const r = clean.substring(0, 2);
  const g = clean.substring(2, 4);
  const b = clean.substring(4, 6);

  return `&H000000${b}${g}${r}`.toUpperCase();
}

// --------------------------------------------------------------------------
// Format builders
// --------------------------------------------------------------------------

function buildSrt(segments: TranscriptionSegmentRow[],translate: boolean): string {
  return segments
    .map((seg, i) =>
      [
        String(i + 1),
        `${toSrtTimestamp(seg.startTime)} --> ${toSrtTimestamp(seg.endTime)}`,
        translate ? seg.translatedText : seg.text,
        "",
      ].join("\n")
    )
    .join("\n");
}

function buildVtt(segments: TranscriptionSegmentRow[],translate: boolean): string {
  const body = segments
    .map((seg, i) =>
      [
        String(i + 1),
        `${toVttTimestamp(seg.startTime)} --> ${toVttTimestamp(seg.endTime)}`,
         translate ? seg.translatedText : seg.text,
        "",
      ].join("\n")
    )
    .join("\n");

  return `WEBVTT\n\n${body}`;
}

function buildTranscript(segments: TranscriptionSegmentRow[],translate: boolean): string {
      const transcript = segments
      .sort((a, b) => a.segmentId - b.segmentId)
      .map(segment =>  translate ? segment.translatedText : segment.text.trim())
      .join("\n");
      return transcript

}

function buildAss(segments: TranscriptionSegmentRow[],translate: boolean,   assOption?: Partial<AssSubtitleStyle>): string {
  // Standard ASS header — tweak font/style to your needs
const style: AssSubtitleStyle = {
    ...DEFAULT_ASS_STYLE,
    ...assOption,
  };

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontFamily},${style.fontSize},${hexToAssColor(style.textColor)},&H00FFFFFF,${hexToAssColor(style.outlineColor)},${hexToAssColor(style.backgroundColor)},${style.bold ? -1 : 0},${style.italic ? -1 : 0},${style.underline ? -1 : 0},0,100,100,0,0,1,2,${style.shadow},2,10,10,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const events = segments
    .map(
      (seg) =>
        `Dialogue: 0,${toAssTimestamp(seg.startTime)},${toAssTimestamp(seg.endTime)},Default,,0,0,0,,${translate ? seg.translatedText : seg.text}`
    )
    .join("\n");

  return `${header}\n${events}\n`;
}

// --------------------------------------------------------------------------
// Public dispatcher
// --------------------------------------------------------------------------



export function formatSubtitle(
  segments: TranscriptionSegmentRow[],
  format: SubtitleFormat,
  translate: boolean,
  assOption?: AssSubtitleStyle
): string {
  switch (format) {
    case SubtitleFormat.SRT:
      return buildSrt(segments, translate);
     case SubtitleFormat.TXT:
      return buildTranscript(segments, translate);
    case SubtitleFormat.VTT:
      return buildVtt(segments, translate);
    case SubtitleFormat.ASS:
      return buildAss(segments, translate, assOption);
    default:
      throw new Error(`Unsupported subtitle format: ${format}`);
  }
}

export function mimeTypeForFormat(format: SubtitleFormat): string {
  switch (format) {
    case SubtitleFormat.SRT:
      return "text/plain; charset=utf-8";
    case SubtitleFormat.VTT:
      return "text/vtt; charset=utf-8";
    case SubtitleFormat.ASS:
      return "text/x-ssa; charset=utf-8";

        case SubtitleFormat.TXT:
      return "text/txt; charset=utf-8";
  }
}

export function extensionForFormat(format: SubtitleFormat): string {
  return format.toLowerCase(); // "srt" | "vtt" | "ass"
}
