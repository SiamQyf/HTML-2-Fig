export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SerializedTextNode {
  nodeType: 3;
  id: string;
  text: string;
  rect: Rect;
  lineCount?: number;
}

export interface SerializedElementNode {
  nodeType: 1;
  id: string;
  tag: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
  rect: Rect;
  childNodes?: Array<SerializedElementNode | SerializedTextNode>;
  content?: string; // SVG outerHTML
  placeholderUrl?: string;
}

export interface AssetEntry {
  url: string;
  blob?: {
    type: string;
    data?: string;
    base64Blob?: string;
  };
}

export interface CapturePayload {
  version: number;
  generator: 'HTML-2-Fig';
  documentTitle?: string;
  documentRect: Rect;
  viewportRect: Rect;
  devicePixelRatio: number;
  root: SerializedElementNode;
  assets: Record<string, AssetEntry>;
  fonts: string[];
}
