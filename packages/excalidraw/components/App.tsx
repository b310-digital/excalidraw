import React, { useContext } from "react";
import { flushSync } from "react-dom";

import type { RoughCanvas } from "roughjs/bin/canvas";
import rough from "roughjs/bin/rough";
import clsx from "clsx";
import { nanoid } from "nanoid";
import {
  actionAddToLibrary,
  actionBringForward,
  actionBringToFront,
  actionCopy,
  actionCopyAsPng,
  actionCopyAsSvg,
  copyText,
  actionCopyStyles,
  actionCut,
  actionDeleteSelected,
  actionDuplicateSelection,
  actionFinalize,
  actionFlipHorizontal,
  actionFlipVertical,
  actionGroup,
  actionPasteStyles,
  actionSelectAll,
  actionSendBackward,
  actionSendToBack,
  actionToggleGridMode,
  actionToggleStats,
  actionToggleZenMode,
  actionUnbindText,
  actionBindText,
  actionUngroup,
  actionLink,
  actionToggleElementLock,
  actionToggleLinearEditor,
  actionToggleObjectsSnapMode,
} from "../actions";
import { createRedoAction, createUndoAction } from "../actions/actionHistory";
import { ActionManager } from "../actions/manager";
import { actions } from "../actions/register";
import type { Action, ActionResult } from "../actions/types";
import { trackEvent } from "../analytics";
import {
  getDefaultAppState,
  isEraserActive,
  isHandToolActive,
} from "../appState";
import type { PastedMixedContent } from "../clipboard";
import { copyTextToSystemClipboard, parseClipboard } from "../clipboard";
import { ARROW_TYPE, type EXPORT_IMAGE_TYPES } from "../constants";
import {
  APP_NAME,
  CURSOR_TYPE,
  DEFAULT_MAX_IMAGE_WIDTH_OR_HEIGHT,
  DEFAULT_VERTICAL_ALIGN,
  DRAGGING_THRESHOLD,
  ELEMENT_SHIFT_TRANSLATE_AMOUNT,
  ELEMENT_TRANSLATE_AMOUNT,
  ENV,
  EVENT,
  FRAME_STYLE,
  IMAGE_MIME_TYPES,
  IMAGE_RENDER_TIMEOUT,
  isBrave,
  LINE_CONFIRM_THRESHOLD,
  MAX_ALLOWED_FILE_BYTES,
  MIME_TYPES,
  MQ_MAX_HEIGHT_LANDSCAPE,
  MQ_MAX_WIDTH_LANDSCAPE,
  MQ_MAX_WIDTH_PORTRAIT,
  MQ_RIGHT_SIDEBAR_MIN_WIDTH,
  POINTER_BUTTON,
  ROUNDNESS,
  SCROLL_TIMEOUT,
  TAP_TWICE_TIMEOUT,
  TEXT_TO_CENTER_SNAP_THRESHOLD,
  THEME,
  THEME_FILTER,
  TOUCH_CTX_MENU_TIMEOUT,
  VERTICAL_ALIGN,
  YOUTUBE_STATES,
  ZOOM_STEP,
  POINTER_EVENTS,
  TOOL_TYPE,
  isIOS,
  supportsResizeObserver,
  DEFAULT_COLLISION_THRESHOLD,
  DEFAULT_TEXT_ALIGN,
} from "../constants";
import type { ExportedElements } from "../data";
import { exportCanvas, loadFromBlob } from "../data";
import Library, { distributeLibraryItemsOnSquareGrid } from "../data/library";
import { restore, restoreElements } from "../data/restore";
import {
  dragNewElement,
  dragSelectedElements,
  duplicateElement,
  getCommonBounds,
  getCursorForResizingElement,
  getDragOffsetXY,
  getElementWithTransformHandleType,
  getNormalizedDimensions,
  getResizeArrowDirection,
  getResizeOffsetXY,
  getLockedLinearCursorAlignSize,
  getTransformHandleTypeFromCoords,
  isInvisiblySmallElement,
  isNonDeletedElement,
  isTextElement,
  newElement,
  newLinearElement,
  newTextElement,
  newImageElement,
  transformElements,
  refreshTextDimensions,
  redrawTextBoundingBox,
  getElementAbsoluteCoords,
} from "../element";
import {
  bindOrUnbindLinearElement,
  bindOrUnbindLinearElements,
  fixBindingsAfterDeletion,
  fixBindingsAfterDuplication,
  getHoveredElementForBinding,
  isBindingEnabled,
  isLinearElementSimpleAndAlreadyBound,
  maybeBindLinearElement,
  shouldEnableBindingForPointerEvent,
  updateBoundElements,
  getSuggestedBindingsForArrows,
} from "../element/binding";
import { LinearElementEditor } from "../element/linearElementEditor";
import { mutateElement, newElementWith } from "../element/mutateElement";
import {
  deepCopyElement,
  duplicateElements,
  newFrameElement,
  newFreeDrawElement,
  newEmbeddableElement,
  newMagicFrameElement,
  newIframeElement,
  newArrowElement,
} from "../element/newElement";
import {
  hasBoundTextElement,
  isArrowElement,
  isBindingElement,
  isBindingElementType,
  isBoundToContainer,
  isFrameLikeElement,
  isImageElement,
  isEmbeddableElement,
  isInitializedImageElement,
  isLinearElement,
  isLinearElementType,
  isUsingAdaptiveRadius,
  isIframeElement,
  isIframeLikeElement,
  isMagicFrameElement,
  isTextBindableContainer,
  isElbowArrow,
  isFlowchartNodeElement,
} from "../element/typeChecks";
import type {
  ExcalidrawBindableElement,
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
  ExcalidrawGenericElement,
  ExcalidrawLinearElement,
  ExcalidrawTextElement,
  NonDeleted,
  InitializedExcalidrawImageElement,
  ExcalidrawImageElement,
  FileId,
  NonDeletedExcalidrawElement,
  ExcalidrawTextContainer,
  ExcalidrawFrameLikeElement,
  ExcalidrawMagicFrameElement,
  ExcalidrawIframeLikeElement,
  IframeData,
  ExcalidrawIframeElement,
  ExcalidrawEmbeddableElement,
  Ordered,
  MagicGenerationData,
  ExcalidrawNonSelectionElement,
  ExcalidrawArrowElement,
} from "../element/types";
import { getCenter, getDistance } from "../gesture";
import {
  editGroupForSelectedElement,
  getElementsInGroup,
  getSelectedGroupIdForElement,
  getSelectedGroupIds,
  isElementInGroup,
  isSelectedViaGroup,
  selectGroupsForSelectedElements,
} from "../groups";
import { History } from "../history";
import { defaultLang, getLanguage, languages, setLanguage, t } from "../i18n";
import {
  CODES,
  shouldResizeFromCenter,
  shouldMaintainAspectRatio,
  shouldRotateWithDiscreteAngle,
  isArrowKey,
  KEYS,
} from "../keys";
import {
  isElementCompletelyInViewport,
  isElementInViewport,
} from "../element/sizeHelpers";
import {
  distance2d,
  getCornerRadius,
  getGridPoint,
  isPathALoop,
} from "../math";
import {
  calculateScrollCenter,
  getElementsWithinSelection,
  getNormalizedZoom,
  getSelectedElements,
  hasBackground,
  isSomeElementSelected,
} from "../scene";
import Scene from "../scene/Scene";
import type {
  RenderInteractiveSceneCallback,
  ScrollBars,
} from "../scene/types";
import { getStateForZoom } from "../scene/zoom";
import { findShapeByKey, getBoundTextShape, getElementShape } from "../shapes";
import { getSelectionBoxShape } from "../../utils/geometry/shape";
import { isPointInShape } from "../../utils/collision";
import type {
  AppClassProperties,
  AppProps,
  AppState,
  BinaryFileData,
  DataURL,
  ExcalidrawImperativeAPI,
  BinaryFiles,
  Gesture,
  GestureEvent,
  LibraryItems,
  PointerDownState,
  SceneData,
  Device,
  FrameNameBoundsCache,
  SidebarName,
  SidebarTabName,
  KeyboardModifiersObject,
  CollaboratorPointer,
  ToolType,
  OnUserFollowedPayload,
  UnsubscribeCallback,
  EmbedsValidationStatus,
  ElementsPendingErasure,
  GenerateDiagramToCode,
  NullableGridSize,
} from "../types";
import {
  debounce,
  distance,
  getFontString,
  getNearestScrollableContainer,
  isInputLike,
  isToolIcon,
  isWritableElement,
  sceneCoordsToViewportCoords,
  tupleToCoors,
  viewportCoordsToSceneCoords,
  wrapEvent,
  updateObject,
  updateActiveTool,
  getShortcutKey,
  isTransparent,
  easeToValuesRAF,
  muteFSAbortError,
  isTestEnv,
  easeOut,
  updateStable,
  addEventListener,
  normalizeEOL,
  getDateTime,
  isShallowEqual,
  arrayToMap,
} from "../utils";
import {
  createSrcDoc,
  embeddableURLValidator,
  maybeParseEmbedSrc,
  getEmbedLink,
} from "../element/embeddable";
import type { ContextMenuItems } from "./ContextMenu";
import { ContextMenu, CONTEXT_MENU_SEPARATOR } from "./ContextMenu";
import LayerUI from "./LayerUI";
import { Toast } from "./Toast";
import { actionToggleViewMode } from "../actions/actionToggleViewMode";
import {
  dataURLToFile,
  generateIdFromFile,
  getDataURL,
  getFileFromEvent,
  ImageURLToFile,
  isImageFileHandle,
  isSupportedImageFile,
  loadSceneOrLibraryFromBlob,
  normalizeFile,
  parseLibraryJSON,
  resizeImageFile,
  SVGStringToFile,
} from "../data/blob";
import {
  getInitializedImageElements,
  loadHTMLImageElement,
  normalizeSVG,
  updateImageCache as _updateImageCache,
} from "../element/image";
import throttle from "lodash.throttle";
import type { FileSystemHandle } from "../data/filesystem";
import { fileOpen } from "../data/filesystem";
import {
  bindTextToShapeAfterDuplication,
  getApproxMinLineHeight,
  getApproxMinLineWidth,
  getBoundTextElement,
  getContainerCenter,
  getContainerElement,
  getLineHeightInPx,
  getMinTextElementWidth,
  isMeasureTextSupported,
  isValidTextContainer,
  measureText,
  normalizeText,
  wrapText,
} from "../element/textElement";
import {
  showHyperlinkTooltip,
  hideHyperlinkToolip,
  Hyperlink,
} from "../components/hyperlink/Hyperlink";
import { isLocalLink, normalizeLink, toValidURL } from "../data/url";
import { shouldShowBoundingBox } from "../element/transformHandles";
import { actionUnlockAllElements } from "../actions/actionElementLock";
import { Fonts, getLineHeight } from "../fonts";
import {
  getFrameChildren,
  isCursorInFrame,
  bindElementsToFramesAfterDuplication,
  addElementsToFrame,
  replaceAllElementsInFrame,
  removeElementsFromFrame,
  getElementsInResizingFrame,
  getElementsInNewFrame,
  getContainingFrame,
  elementOverlapsWithFrame,
  updateFrameMembershipOfSelectedElements,
  isElementInFrame,
  getFrameLikeTitle,
  getElementsOverlappingFrame,
  filterElementsEligibleAsFrameChildren,
} from "../frame";
import {
  excludeElementsInFramesFromSelection,
  makeNextSelectedElementIds,
} from "../scene/selection";
import { actionPaste } from "../actions/actionClipboard";
import {
  actionRemoveAllElementsFromFrame,
  actionSelectAllElementsInFrame,
} from "../actions/actionFrame";
import { actionToggleHandTool, zoomToFit } from "../actions/actionCanvas";
import { jotaiStore } from "../jotai";
import { activeConfirmDialogAtom } from "./ActiveConfirmDialog";
import { ImageSceneDataError } from "../errors";
import {
  getSnapLinesAtPointer,
  snapDraggedElements,
  isActiveToolNonLinearSnappable,
  snapNewElement,
  snapResizingElements,
  isSnappingEnabled,
  getVisibleGaps,
  getReferenceSnapPoints,
  SnapCache,
  isGridModeEnabled,
} from "../snapping";
import { actionWrapTextInContainer } from "../actions/actionBoundText";
import BraveMeasureTextError from "./BraveMeasureTextError";
import { activeEyeDropperAtom } from "./EyeDropper";
import type { ExcalidrawElementSkeleton } from "../data/transform";
import { convertToExcalidrawElements } from "../data/transform";
import type { ValueOf } from "../utility-types";
import { isSidebarDockedAtom } from "./Sidebar/Sidebar";
import { StaticCanvas, InteractiveCanvas } from "./canvases";
import { Renderer } from "../scene/Renderer";
import { ShapeCache } from "../scene/ShapeCache";
import { SVGLayer } from "./SVGLayer";
import {
  setEraserCursor,
  setCursor,
  resetCursor,
  setCursorForShape,
} from "../cursor";
import { Emitter } from "../emitter";
import { ElementCanvasButtons } from "../element/ElementCanvasButtons";
import { COLOR_PALETTE } from "../colors";
import { ElementCanvasButton } from "./MagicButton";
import { MagicIcon, copyIcon, fullscreenIcon } from "./icons";
import FollowMode from "./FollowMode/FollowMode";
import { Store, StoreAction } from "../store";
import { AnimationFrameHandler } from "../animation-frame-handler";
import { AnimatedTrail } from "../animated-trail";
import { LaserTrails } from "../laser-trails";
import { withBatchedUpdates, withBatchedUpdatesThrottled } from "../reactUtils";
import { getRenderOpacity } from "../renderer/renderElement";
import {
  hitElementBoundText,
  hitElementBoundingBoxOnly,
  hitElementItself,
} from "../element/collision";
import { textWysiwyg } from "../element/textWysiwyg";
import { isOverScrollBars } from "../scene/scrollbars";
import { syncInvalidIndices, syncMovedIndices } from "../fractionalIndex";
import {
  isPointHittingLink,
  isPointHittingLinkIcon,
} from "./hyperlink/helpers";
import { getShortcutFromShortcutName } from "../actions/shortcuts";
import { actionTextAutoResize } from "../actions/actionTextAutoResize";
import { getVisibleSceneBounds } from "../element/bounds";
import { isMaybeMermaidDefinition } from "../mermaid";
import NewElementCanvas from "./canvases/NewElementCanvas";
import { mutateElbowArrow } from "../element/routing";
import {
  FlowChartCreator,
  FlowChartNavigator,
  getLinkDirectionFromKey,
} from "../element/flowchart";

const AppContext = React.createContext<AppClassProperties>(null!);
const AppPropsContext = React.createContext<AppProps>(null!);

const deviceContextInitialValue = {
  viewport: {
    isMobile: false,
    isLandscape: false,
  },
  editor: {
    isMobile: false,
    canFitSidebar: false,
  },
  isTouchScreen: false,
};
const DeviceContext = React.createContext<Device>(deviceContextInitialValue);
DeviceContext.displayName = "DeviceContext";

export const ExcalidrawContainerContext = React.createContext<{
  container: HTMLDivElement | null;
  id: string | null;
}>({ container: null, id: null });
ExcalidrawContainerContext.displayName = "ExcalidrawContainerContext";

const ExcalidrawElementsContext = React.createContext<
  readonly NonDeletedExcalidrawElement[]
>([]);
ExcalidrawElementsContext.displayName = "ExcalidrawElementsContext";

const ExcalidrawAppStateContext = React.createContext<AppState>({
  ...getDefaultAppState(),
  width: 0,
  height: 0,
  offsetLeft: 0,
  offsetTop: 0,
});
ExcalidrawAppStateContext.displayName = "ExcalidrawAppStateContext";

const ExcalidrawSetAppStateContext = React.createContext<
  React.Component<any, AppState>["setState"]
>(() => {
  console.warn("Uninitialized ExcalidrawSetAppStateContext context!");
});
ExcalidrawSetAppStateContext.displayName = "ExcalidrawSetAppStateContext";

const ExcalidrawActionManagerContext = React.createContext<ActionManager>(
  null!,
);
ExcalidrawActionManagerContext.displayName = "ExcalidrawActionManagerContext";

export const useApp = () => useContext(AppContext);
export const useAppProps = () => useContext(AppPropsContext);
export const useDevice = () => useContext<Device>(DeviceContext);
export const useExcalidrawContainer = () =>
  useContext(ExcalidrawContainerContext);
export const useExcalidrawElements = () =>
  useContext(ExcalidrawElementsContext);
export const useExcalidrawAppState = () =>
  useContext(ExcalidrawAppStateContext);
export const useExcalidrawSetAppState = () =>
  useContext(ExcalidrawSetAppStateContext);
export const useExcalidrawActionManager = () =>
  useContext(ExcalidrawActionManagerContext);

let didTapTwice: boolean = false;
let tappedTwiceTimer = 0;
let isHoldingSpace: boolean = false;
let isPanning: boolean = false;
let isDraggingScrollBar: boolean = false;
let currentScrollBars: ScrollBars = { horizontal: null, vertical: null };
let touchTimeout = 0;
let invalidateContextMenu = false;

/**
 * Map of youtube embed video states
 */
const YOUTUBE_VIDEO_STATES = new Map<
  ExcalidrawElement["id"],
  ValueOf<typeof YOUTUBE_STATES>
>();

let IS_PLAIN_PASTE = false;
let IS_PLAIN_PASTE_TIMER = 0;
let PLAIN_PASTE_TOAST_SHOWN = false;

let lastPointerUp: (() => void) | null = null;
const gesture: Gesture = {
  pointers: new Map(),
  lastCenter: null,
  initialDistance: null,
  initialScale: null,
};

class App extends React.Component<AppProps, AppState> {
  canvas: AppClassProperties["canvas"];
  interactiveCanvas: AppClassProperties["interactiveCanvas"] = null;
  rc: RoughCanvas;
  unmounted: boolean = false;
  actionManager: ActionManager;
  device: Device = deviceContextInitialValue;

  private excalidrawContainerRef = React.createRef<HTMLDivElement>();

  public scene: Scene;
  public fonts: Fonts;
  public renderer: Renderer;
  private resizeObserver: ResizeObserver | undefined;
  private nearestScrollableContainer: HTMLElement | Document | undefined;
  public library: AppClassProperties["library"];
  public libraryItemsFromStorage: LibraryItems | undefined;
  public id: string;
  private store: Store;
  private history: History;
  private excalidrawContainerValue: {
    container: HTMLDivElement | null;
    id: string;
  };

  public files: BinaryFiles = {};
  public imageCache: AppClassProperties["imageCache"] = new Map();
  private iFrameRefs = new Map<ExcalidrawElement["id"], HTMLIFrameElement>();
  /**
   * Indicates whether the embeddable's url has been validated for rendering.
   * If value not set, indicates that the validation is pending.
   * Initially or on url change the flag is not reset so that we can guarantee
   * the validation came from a trusted source (the editor).
   **/
  private embedsValidationStatus: EmbedsValidationStatus = new Map();
  /** embeds that have been inserted to DOM (as a perf optim, we don't want to
   * insert to DOM before user initially scrolls to them) */
  private initializedEmbeds = new Set<ExcalidrawIframeLikeElement["id"]>();

  private elementsPendingErasure: ElementsPendingErasure = new Set();

  public flowChartCreator: FlowChartCreator = new FlowChartCreator();
  private flowChartNavigator: FlowChartNavigator = new FlowChartNavigator();

  hitLinkElement?: NonDeletedExcalidrawElement;
  lastPointerDownEvent: React.PointerEvent<HTMLElement> | null = null;
  lastPointerUpEvent: React.PointerEvent<HTMLElement> | PointerEvent | null =
    null;
  lastPointerMoveEvent: PointerEvent | null = null;
  lastViewportPosition = { x: 0, y: 0 };

  animationFrameHandler = new AnimationFrameHandler();

  laserTrails = new LaserTrails(this.animationFrameHandler, this);
  eraserTrail = new AnimatedTrail(this.animationFrameHandler, this, {
    streamline: 0.2,
    size: 5,
    keepHead: true,
    sizeMapping: (c) => {
      const DECAY_TIME = 200;
      const DECAY_LENGTH = 10;
      const t = Math.max(0, 1 - (performance.now() - c.pressure) / DECAY_TIME);
      const l =
        (DECAY_LENGTH -
          Math.min(DECAY_LENGTH, c.totalLength - c.currentIndex)) /
        DECAY_LENGTH;

      return Math.min(easeOut(l), easeOut(t));
    },
    fill: () =>
      this.state.theme === THEME.LIGHT
        ? "rgba(0, 0, 0, 0.2)"
        : "rgba(255, 255, 255, 0.2)",
  });

  onChangeEmitter = new Emitter<
    [
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ]
  >();

  onPointerDownEmitter = new Emitter<
    [
      activeTool: AppState["activeTool"],
      pointerDownState: PointerDownState,
      event: React.PointerEvent<HTMLElement>,
    ]
  >();

  onPointerUpEmitter = new Emitter<
    [
      activeTool: AppState["activeTool"],
      pointerDownState: PointerDownState,
      event: PointerEvent,
    ]
  >();
  onUserFollowEmitter = new Emitter<[payload: OnUserFollowedPayload]>();
  onScrollChangeEmitter = new Emitter<
    [scrollX: number, scrollY: number, zoom: AppState["zoom"]]
  >();

  missingPointerEventCleanupEmitter = new Emitter<
    [event: PointerEvent | null]
  >();
  onRemoveEventListenersEmitter = new Emitter<[]>();

  constructor(props: AppProps) {
    super(props);
    const defaultAppState = getDefaultAppState();
    const {
      excalidrawAPI,
      viewModeEnabled = false,
      zenModeEnabled = false,
      gridModeEnabled = false,
      objectsSnapModeEnabled = false,
      theme = defaultAppState.theme,
      name = `${t("labels.untitled")}-${getDateTime()}`,
    } = props;
    this.state = {
      ...defaultAppState,
      theme,
      isLoading: true,
      ...this.getCanvasOffsets(),
      viewModeEnabled,
      zenModeEnabled,
      objectsSnapModeEnabled,
      gridModeEnabled: gridModeEnabled ?? defaultAppState.gridModeEnabled,
      name,
      width: window.innerWidth,
      height: window.innerHeight,
    };

    this.id = nanoid();
    this.library = new Library(this);
    this.actionManager = new ActionManager(
      this.syncActionResult,
      () => this.state,
      () => this.scene.getElementsIncludingDeleted(),
      this,
    );
    this.scene = new Scene();

    this.canvas = document.createElement("canvas");
    this.rc = rough.canvas(this.canvas);
    this.renderer = new Renderer(this.scene);

    this.store = new Store();
    this.history = new History();

    if (excalidrawAPI) {
      const api: ExcalidrawImperativeAPI = {
        updateScene: this.updateScene,
        updateLibrary: this.library.updateLibrary,
        addFiles: this.addFiles,
        resetScene: this.resetScene,
        getSceneElementsIncludingDeleted: this.getSceneElementsIncludingDeleted,
        history: {
          clear: this.resetHistory,
        },
        scrollToContent: this.scrollToContent,
        getSceneElements: this.getSceneElements,
        getAppState: () => this.state,
        getFiles: () => this.files,
        getName: this.getName,
        registerAction: (action: Action) => {
          this.actionManager.registerAction(action);
        },
        refresh: this.refresh,
        setToast: this.setToast,
        id: this.id,
        setActiveTool: this.setActiveTool,
        setCursor: this.setCursor,
        resetCursor: this.resetCursor,
        updateFrameRendering: this.updateFrameRendering,
        toggleSidebar: this.toggleSidebar,
        onChange: (cb) => this.onChangeEmitter.on(cb),
        onPointerDown: (cb) => this.onPointerDownEmitter.on(cb),
        onPointerUp: (cb) => this.onPointerUpEmitter.on(cb),
        onScrollChange: (cb) => this.onScrollChangeEmitter.on(cb),
        onUserFollow: (cb) => this.onUserFollowEmitter.on(cb),
      } as const;
      if (typeof excalidrawAPI === "function") {
        excalidrawAPI(api);
      } else {
        console.error("excalidrawAPI should be a function!");
      }
    }

    this.excalidrawContainerValue = {
      container: this.excalidrawContainerRef.current,
      id: this.id,
    };

    this.fonts = new Fonts({ scene: this.scene });
    this.history = new History();

    this.actionManager.registerAll(actions);
    this.actionManager.registerAction(
      createUndoAction(this.history, this.store),
    );
    this.actionManager.registerAction(
      createRedoAction(this.history, this.store),
    );
  }

  private onWindowMessage(event: MessageEvent) {
    if (
      event.origin !== "https://player.vimeo.com" &&
      event.origin !== "https://www.youtube.com"
    ) {
      return;
    }

    let data = null;
    try {
      data = JSON.parse(event.data);
    } catch (e) { }
    if (!data) {
      return;
    }

    switch (event.origin) {
      case "https://player.vimeo.com":
        //Allowing for multiple instances of Excalidraw running in the window
        if (data.method === "paused") {
          let source: Window | null = null;
          const iframes = document.body.querySelectorAll(
            "iframe.excalidraw__embeddable",
          );
          if (!iframes) {
            break;
          }
          for (const iframe of iframes as NodeListOf<HTMLIFrameElement>) {
            if (iframe.contentWindow === event.source) {
              source = iframe.contentWindow;
            }
          }
          source?.postMessage(
            JSON.stringify({
              method: data.value ? "play" : "pause",
              value: true,
            }),
            "*",
          );
        }
        break;
      case "https://www.youtube.com":
        if (
          data.event === "infoDelivery" &&
          data.info &&
          data.id &&
          typeof data.info.playerState === "number"
        ) {
          const id = data.id;
          const playerState = data.info.playerState as number;
          if (
            (Object.values(YOUTUBE_STATES) as number[]).includes(playerState)
          ) {
            YOUTUBE_VIDEO_STATES.set(
              id,
              playerState as ValueOf<typeof YOUTUBE_STATES>,
            );
          }
        }
        break;
    }
  }

  private cacheEmbeddableRef(
    element: ExcalidrawIframeLikeElement,
    ref: HTMLIFrameElement | null,
  ) {
    if (ref) {
      this.iFrameRefs.set(element.id, ref);
    }
  }

  /**
   * Returns gridSize taking into account `gridModeEnabled`.
   * If disabled, returns null.
   */
  public getEffectiveGridSize = () => {
    return (
      isGridModeEnabled(this) ? this.state.gridSize : null
    ) as NullableGridSize;
  };

  private getHTMLIFrameElement(
    element: ExcalidrawIframeLikeElement,
  ): HTMLIFrameElement | undefined {
    return this.iFrameRefs.get(element.id);
  }

  private handleEmbeddableCenterClick(element: ExcalidrawIframeLikeElement) {
    if (
      this.state.activeEmbeddable?.element === element &&
      this.state.activeEmbeddable?.state === "active"
    ) {
      return;
    }

    // The delay serves two purposes
    // 1. To prevent first click propagating to iframe on mobile,
    //    else the click will immediately start and stop the video
    // 2. If the user double clicks the frame center to activate it
    //    without the delay youtube will immediately open the video
    //    in fullscreen mode
    setTimeout(() => {
      this.setState({
        activeEmbeddable: { element, state: "active" },
        selectedElementIds: { [element.id]: true },
        newElement: null,
        selectionElement: null,
      });
    }, 100);

    if (isIframeElement(element)) {
      return;
    }

    const iframe = this.getHTMLIFrameElement(element);

    if (!iframe?.contentWindow) {
      return;
    }

    if (iframe.src.includes("youtube")) {
      const state = YOUTUBE_VIDEO_STATES.get(element.id);
      if (!state) {
        YOUTUBE_VIDEO_STATES.set(element.id, YOUTUBE_STATES.UNSTARTED);
        iframe.contentWindow.postMessage(
          JSON.stringify({
            event: "listening",
            id: element.id,
          }),
          "*",
        );
      }
      switch (state) {
        case YOUTUBE_STATES.PLAYING:
        case YOUTUBE_STATES.BUFFERING:
          iframe.contentWindow?.postMessage(
            JSON.stringify({
              event: "command",
              func: "pauseVideo",
              args: "",
            }),
            "*",
          );
          break;
        default:
          iframe.contentWindow?.postMessage(
            JSON.stringify({
              event: "command",
              func: "playVideo",
              args: "",
            }),
            "*",
          );
      }
    }

    if (iframe.src.includes("player.vimeo.com")) {
      iframe.contentWindow.postMessage(
        JSON.stringify({
          method: "paused", //video play/pause in onWindowMessage handler
        }),
        "*",
      );
    }
  }

  private isIframeLikeElementCenter(
    el: ExcalidrawIframeLikeElement | null,
    event: React.PointerEvent<HTMLElement> | PointerEvent,
    sceneX: number,
    sceneY: number,
  ) {
    return (
      el &&
      !event.altKey &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      (this.state.activeEmbeddable?.element !== el ||
        this.state.activeEmbeddable?.state === "hover" ||
        !this.state.activeEmbeddable) &&
      sceneX >= el.x + el.width / 3 &&
      sceneX <= el.x + (2 * el.width) / 3 &&
      sceneY >= el.y + el.height / 3 &&
      sceneY <= el.y + (2 * el.height) / 3
    );
  }

  private updateEmbedValidationStatus = (
    element: ExcalidrawEmbeddableElement,
    status: boolean,
  ) => {
    this.embedsValidationStatus.set(element.id, status);
    ShapeCache.delete(element);
  };

  private updateEmbeddables = () => {
    const iframeLikes = new Set<ExcalidrawIframeLikeElement["id"]>();

    let updated = false;
    this.scene.getNonDeletedElements().filter((element) => {
      if (isEmbeddableElement(element)) {
        iframeLikes.add(element.id);
        if (!this.embedsValidationStatus.has(element.id)) {
          updated = true;

          const validated = embeddableURLValidator(
            element.link,
            this.props.validateEmbeddable,
          );

          this.updateEmbedValidationStatus(element, validated);
        }
      } else if (isIframeElement(element)) {
        iframeLikes.add(element.id);
      }
      return false;
    });

    if (updated) {
      this.scene.triggerUpdate();
    }

    // GC
    this.iFrameRefs.forEach((ref, id) => {
      if (!iframeLikes.has(id)) {
        this.iFrameRefs.delete(id);
      }
    });
  };

  private renderEmbeddables() {
    const scale = this.state.zoom.value;
    const normalizedWidth = this.state.width;
    const normalizedHeight = this.state.height;

    const embeddableElements = this.scene
      .getNonDeletedElements()
      .filter(
        (el): el is Ordered<NonDeleted<ExcalidrawIframeLikeElement>> =>
          (isEmbeddableElement(el) &&
            this.embedsValidationStatus.get(el.id) === true) ||
          isIframeElement(el),
      );

    return (
      <>
        {embeddableElements.map((el) => {
          const { x, y } = sceneCoordsToViewportCoords(
            { sceneX: el.x, sceneY: el.y },
            this.state,
          );

          const isVisible = isElementInViewport(
            el,
            normalizedWidth,
            normalizedHeight,
            this.state,
            this.scene.getNonDeletedElementsMap(),
          );
          const hasBeenInitialized = this.initializedEmbeds.has(el.id);

          if (isVisible && !hasBeenInitialized) {
            this.initializedEmbeds.add(el.id);
          }
          const shouldRender = isVisible || hasBeenInitialized;

          if (!shouldRender) {
            return null;
          }

          let src: IframeData | null;

          if (isIframeElement(el)) {
            src = null;

            const data: MagicGenerationData = (el.customData?.generationData ??
              this.magicGenerations.get(el.id)) || {
              status: "error",
              message: "No generation data",
              code: "ERR_NO_GENERATION_DATA",
            };

            if (data.status === "done") {
              const html = data.html;
              src = {
                intrinsicSize: { w: el.width, h: el.height },
                type: "document",
                srcdoc: () => {
                  return html;
                },
              } as const;
            } else if (data.status === "pending") {
              src = {
                intrinsicSize: { w: el.width, h: el.height },
                type: "document",
                srcdoc: () => {
                  return createSrcDoc(`
                    <style>
                      html, body {
                        width: 100%;
                        height: 100%;
                        color: ${this.state.theme === THEME.DARK ? "white" : "black"
                    };
                      }
                      body {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-direction: column;
                        gap: 1rem;
                      }

                      .Spinner {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin-left: auto;
                        margin-right: auto;
                      }

                      .Spinner svg {
                        animation: rotate 1.6s linear infinite;
                        transform-origin: center center;
                        width: 40px;
                        height: 40px;
                      }

                      .Spinner circle {
                        stroke: currentColor;
                        animation: dash 1.6s linear 0s infinite;
                        stroke-linecap: round;
                      }

                      @keyframes rotate {
                        100% {
                          transform: rotate(360deg);
                        }
                      }

                      @keyframes dash {
                        0% {
                          stroke-dasharray: 1, 300;
                          stroke-dashoffset: 0;
                        }
                        50% {
                          stroke-dasharray: 150, 300;
                          stroke-dashoffset: -200;
                        }
                        100% {
                          stroke-dasharray: 1, 300;
                          stroke-dashoffset: -280;
                        }
                      }
                    </style>
                    <div class="Spinner">
                      <svg
                        viewBox="0 0 100 100"
                      >
                        <circle
                          cx="50"
                          cy="50"
                          r="46"
                          stroke-width="8"
                          fill="none"
                          stroke-miter-limit="10"
                        />
                      </svg>
                    </div>
                    <div>Generating...</div>
                  `);
                },
              } as const;
            } else {
              let message: string;
              if (data.code === "ERR_GENERATION_INTERRUPTED") {
                message = "Generation was interrupted...";
              } else {
                message = data.message || "Generation failed";
              }
              src = {
                intrinsicSize: { w: el.width, h: el.height },
                type: "document",
                srcdoc: () => {
                  return createSrcDoc(`
                    <style>
                    html, body {
                      height: 100%;
                    }
                      body {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        color: ${COLOR_PALETTE.red[3]};
                      }
                      h1, h3 {
                        margin-top: 0;
                        margin-bottom: 0.5rem;
                      }
                    </style>
                    <h1>Error!</h1>
                    <h3>${message}</h3>
                  `);
                },
              } as const;
            }
          } else {
            src = getEmbedLink(toValidURL(el.link || ""));
          }

          const isActive =
            this.state.activeEmbeddable?.element === el &&
            this.state.activeEmbeddable?.state === "active";
          const isHovered =
            this.state.activeEmbeddable?.element === el &&
            this.state.activeEmbeddable?.state === "hover";

          return (
            <div
              key={el.id}
              className={clsx("excalidraw__embeddable-container", {
                "is-hovered": isHovered,
              })}
              style={{
                transform: isVisible
                  ? `translate(${x - this.state.offsetLeft}px, ${y - this.state.offsetTop
                  }px) scale(${scale})`
                  : "none",
                display: isVisible ? "block" : "none",
                opacity: getRenderOpacity(
                  el,
                  getContainingFrame(el, this.scene.getNonDeletedElementsMap()),
                  this.elementsPendingErasure,
                  null,
                ),
                ["--embeddable-radius" as string]: `${getCornerRadius(
                  Math.min(el.width, el.height),
                  el,
                )}px`,
              }}
            >
              <div
                //this is a hack that addresses isse with embedded excalidraw.com embeddable
                //https://github.com/excalidraw/excalidraw/pull/6691#issuecomment-1607383938
                /*ref={(ref) => {
                  if (!this.excalidrawContainerRef.current) {
                    return;
                  }
                  const container = this.excalidrawContainerRef.current;
                  const sh = container.scrollHeight;
                  const ch = container.clientHeight;
                  if (sh !== ch) {
                    container.style.height = `${sh}px`;
                    setTimeout(() => {
                      container.style.height = `100%`;
                    });
                  }
                }}*/
                className="excalidraw__embeddable-container__inner"
                style={{
                  width: isVisible ? `${el.width}px` : 0,
                  height: isVisible ? `${el.height}px` : 0,
                  transform: isVisible ? `rotate(${el.angle}rad)` : "none",
                  pointerEvents: isActive
                    ? POINTER_EVENTS.enabled
                    : POINTER_EVENTS.disabled,
                }}
              >
                {isHovered && (
                  <div className="excalidraw__embeddable-hint">
                    {t("buttons.embeddableInteractionButton")}
                  </div>
                )}
                <div
                  className="excalidraw__embeddable__outer"
                  style={{
                    padding: `${el.strokeWidth}px`,
                  }}
                >
                  {(isEmbeddableElement(el)
                    ? this.props.renderEmbeddable?.(el, this.state)
                    : null) ?? (
                      <iframe
                        ref={(ref) => this.cacheEmbeddableRef(el, ref)}
                        className="excalidraw__embeddable"
                        srcDoc={
                          src?.type === "document"
                            ? src.srcdoc(this.state.theme)
                            : undefined
                        }
                        src={
                          src?.type !== "document" ? src?.link ?? "" : undefined
                        }
                        // https://stackoverflow.com/q/18470015
                        scrolling="no"
                        referrerPolicy="no-referrer-when-downgrade"
                        title="Excalidraw Embedded Content"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen={true}
                        sandbox={`${src?.sandbox?.allowSameOrigin ? "allow-same-origin" : ""
                          } allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads`}
                      />
                    )}
                </div>
              </div>
            </div>
          );
        })}
      </>
    );
  }

  private getFrameNameDOMId = (frameElement: ExcalidrawElement) => {
    return `${this.id}-frame-name-${frameElement.id}`;
  };

  frameNameBoundsCache: FrameNameBoundsCache = {
    get: (frameElement) => {
      let bounds = this.frameNameBoundsCache._cache.get(frameElement.id);
      if (
        !bounds ||
        bounds.zoom !== this.state.zoom.value ||
        bounds.versionNonce !== frameElement.versionNonce
      ) {
        const frameNameDiv = document.getElementById(
          this.getFrameNameDOMId(frameElement),
        );

        if (frameNameDiv) {
          const box = frameNameDiv.getBoundingClientRect();
          const boxSceneTopLeft = viewportCoordsToSceneCoords(
            { clientX: box.x, clientY: box.y },
            this.state,
          );
          const boxSceneBottomRight = viewportCoordsToSceneCoords(
            { clientX: box.right, clientY: box.bottom },
            this.state,
          );

          bounds = {
            x: boxSceneTopLeft.x,
            y: boxSceneTopLeft.y,
            width: boxSceneBottomRight.x - boxSceneTopLeft.x,
            height: boxSceneBottomRight.y - boxSceneTopLeft.y,
            angle: 0,
            zoom: this.state.zoom.value,
            versionNonce: frameElement.versionNonce,
          };

          this.frameNameBoundsCache._cache.set(frameElement.id, bounds);

          return bounds;
        }
        return null;
      }

      return bounds;
    },
    /**
     * @private
     */
    _cache: new Map(),
  };

  private renderFrameNames = () => {
    if (!this.state.frameRendering.enabled || !this.state.frameRendering.name) {
      return null;
    }

    const isDarkTheme = this.state.theme === THEME.DARK;

    return this.scene.getNonDeletedFramesLikes().map((f) => {
      if (
        !isElementInViewport(
          f,
          this.canvas.width / window.devicePixelRatio,
          this.canvas.height / window.devicePixelRatio,
          {
            offsetLeft: this.state.offsetLeft,
            offsetTop: this.state.offsetTop,
            scrollX: this.state.scrollX,
            scrollY: this.state.scrollY,
            zoom: this.state.zoom,
          },
          this.scene.getNonDeletedElementsMap(),
        )
      ) {
        // if frame not visible, don't render its name
        return null;
      }

      const { x: x1, y: y1 } = sceneCoordsToViewportCoords(
        { sceneX: f.x, sceneY: f.y },
        this.state,
      );

      const FRAME_NAME_EDIT_PADDING = 6;

      const reset = () => {
        mutateElement(f, { name: f.name?.trim() || null });
        this.setState({ editingFrame: null });
      };

      let frameNameJSX;

      const frameName = getFrameLikeTitle(f);

      if (f.id === this.state.editingFrame) {
        const frameNameInEdit = frameName;

        frameNameJSX = (
          <input
            autoFocus
            value={frameNameInEdit}
            onChange={(e) => {
              mutateElement(f, {
                name: e.target.value,
              });
            }}
            onFocus={(e) => e.target.select()}
            onBlur={() => reset()}
            onKeyDown={(event) => {
              // for some inexplicable reason, `onBlur` triggered on ESC
              // does not reset `state.editingFrame` despite being called,
              // and we need to reset it here as well
              if (event.key === KEYS.ESCAPE || event.key === KEYS.ENTER) {
                reset();
              }
            }}
            style={{
              background: this.state.viewBackgroundColor,
              filter: isDarkTheme ? THEME_FILTER : "none",
              zIndex: 2,
              border: "none",
              display: "block",
              padding: `${FRAME_NAME_EDIT_PADDING}px`,
              borderRadius: 4,
              boxShadow: "inset 0 0 0 1px var(--color-primary)",
              fontFamily: "Assistant",
              fontSize: "14px",
              transform: `translate(-${FRAME_NAME_EDIT_PADDING}px, ${FRAME_NAME_EDIT_PADDING}px)`,
              color: "var(--color-gray-80)",
              overflow: "hidden",
              maxWidth: `${document.body.clientWidth - x1 - FRAME_NAME_EDIT_PADDING
                }px`,
            }}
            size={frameNameInEdit.length + 1 || 1}
            dir="auto"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
          />
        );
      } else {
        frameNameJSX = frameName;
      }

      return (
        <div
          id={this.getFrameNameDOMId(f)}
          key={f.id}
          style={{
            position: "absolute",
            // Positioning from bottom so that we don't to either
            // calculate text height or adjust using transform (which)
            // messes up input position when editing the frame name.
            // This makes the positioning deterministic and we can calculate
            // the same position when rendering to canvas / svg.
            bottom: `${this.state.height +
              FRAME_STYLE.nameOffsetY -
              y1 +
              this.state.offsetTop
              }px`,
            left: `${x1 - this.state.offsetLeft}px`,
            zIndex: 2,
            fontSize: FRAME_STYLE.nameFontSize,
            color: isDarkTheme
              ? FRAME_STYLE.nameColorDarkTheme
              : FRAME_STYLE.nameColorLightTheme,
            lineHeight: FRAME_STYLE.nameLineHeight,
            width: "max-content",
            maxWidth: `${f.width}px`,
            overflow: f.id === this.state.editingFrame ? "visible" : "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            cursor: CURSOR_TYPE.MOVE,
            pointerEvents: this.state.viewModeEnabled
              ? POINTER_EVENTS.disabled
              : POINTER_EVENTS.enabled,
          }}
          onPointerDown={(event) => this.handleCanvasPointerDown(event)}
          onWheel={(event) => this.handleWheel(event)}
          onContextMenu={this.handleCanvasContextMenu}
          onDoubleClick={() => {
            this.setState({
              editingFrame: f.id,
            });
          }}
        >
          {frameNameJSX}
        </div>
      );
    });
  };

  private toggleOverscrollBehavior(event: React.PointerEvent) {
    // when pointer inside editor, disable overscroll behavior to prevent
    // panning to trigger history back/forward on MacOS Chrome
    document.documentElement.style.overscrollBehaviorX =
      event.type === "pointerenter" ? "none" : "auto";
  }

  public render() {
    const selectedElements = this.scene.getSelectedElements(this.state);
    const { renderTopRightUI, renderCustomStats } = this.props;

    const sceneNonce = this.scene.getSceneNonce();
    const { elementsMap, visibleElements } =
      this.renderer.getRenderableElements({
        sceneNonce,
        zoom: this.state.zoom,
        offsetLeft: this.state.offsetLeft,
        offsetTop: this.state.offsetTop,
        scrollX: this.state.scrollX,
        scrollY: this.state.scrollY,
        height: this.state.height,
        width: this.state.width,
        editingTextElement: this.state.editingTextElement,
        newElementId: this.state.newElement?.id,
        pendingImageElementId: this.state.pendingImageElementId,
      });

    const allElementsMap = this.scene.getNonDeletedElementsMap();

    const shouldBlockPointerEvents =
      this.state.selectionElement ||
      this.state.newElement ||
      this.state.selectedElementsAreBeingDragged ||
      this.state.resizingElement ||
      (this.state.activeTool.type === "laser" &&
        // technically we can just test on this once we make it more safe
        this.state.cursorButton === "down");

    const firstSelectedElement = selectedElements[0];

    return (
      <div
        className={clsx("excalidraw excalidraw-container", {
          "excalidraw--view-mode": this.state.viewModeEnabled,
          "excalidraw--mobile": this.device.editor.isMobile,
        })}
        style={{
          ["--ui-pointerEvents" as any]: shouldBlockPointerEvents
            ? POINTER_EVENTS.disabled
            : POINTER_EVENTS.enabled,
        }}
        ref={this.excalidrawContainerRef}
        onDrop={this.handleAppOnDrop}
        tabIndex={0}
        onKeyDown={
          this.props.handleKeyboardGlobally ? undefined : this.onKeyDown
        }
        onPointerEnter={this.toggleOverscrollBehavior}
        onPointerLeave={this.toggleOverscrollBehavior}
      >
        <AppContext.Provider value={this}>
          <AppPropsContext.Provider value={this.props}>
            <ExcalidrawContainerContext.Provider
              value={this.excalidrawContainerValue}
            >
              <DeviceContext.Provider value={this.device}>
                <ExcalidrawSetAppStateContext.Provider value={this.setAppState}>
                  <ExcalidrawAppStateContext.Provider value={this.state}>
                    <ExcalidrawElementsContext.Provider
                      value={this.scene.getNonDeletedElements()}
                    >
                      <ExcalidrawActionManagerContext.Provider
                        value={this.actionManager}
                      >
                        <LayerUI
                          canvas={this.canvas}
                          appState={this.state}
                          files={this.files}
                          setAppState={this.setAppState}
                          actionManager={this.actionManager}
                          elements={this.scene.getNonDeletedElements()}
                          onLockToggle={this.toggleLock}
                          onPenModeToggle={this.togglePenMode}
                          onHandToolToggle={this.onHandToolToggle}
                          langCode={getLanguage().code}
                          renderTopRightUI={renderTopRightUI}
                          renderCustomStats={renderCustomStats}
                          showExitZenModeBtn={
                            typeof this.props?.zenModeEnabled === "undefined" &&
                            this.state.zenModeEnabled
                          }
                          UIOptions={this.props.UIOptions}
                          onExportImage={this.onExportImage}
                          renderWelcomeScreen={
                            !this.state.isLoading &&
                            this.state.showWelcomeScreen &&
                            this.state.activeTool.type === "selection" &&
                            !this.state.zenModeEnabled &&
                            !this.scene.getElementsIncludingDeleted().length
                          }
                          app={this}
                          isCollaborating={this.props.isCollaborating}
                        >
                          {this.props.children}
                        </LayerUI>

                        <div className="excalidraw-textEditorContainer" />
                        <div className="excalidraw-contextMenuContainer" />
                        <div className="excalidraw-eye-dropper-container" />
                        <SVGLayer
                          trails={[this.laserTrails, this.eraserTrail]}
                        />
                        {selectedElements.length === 1 &&
                          this.state.showHyperlinkPopup && (
                            <Hyperlink
                              key={firstSelectedElement.id}
                              element={firstSelectedElement}
                              elementsMap={allElementsMap}
                              setAppState={this.setAppState}
                              onLinkOpen={this.props.onLinkOpen}
                              setToast={this.setToast}
                              updateEmbedValidationStatus={
                                this.updateEmbedValidationStatus
                              }
                            />
                          )}
                        {this.props.aiEnabled !== false &&
                          selectedElements.length === 1 &&
                          isMagicFrameElement(firstSelectedElement) && (
                            <ElementCanvasButtons
                              element={firstSelectedElement}
                              elementsMap={elementsMap}
                            >
                              <ElementCanvasButton
                                title={t("labels.convertToCode")}
                                icon={MagicIcon}
                                checked={false}
                                onChange={() =>
                                  this.onMagicFrameGenerate(
                                    firstSelectedElement,
                                    "button",
                                  )
                                }
                              />
                            </ElementCanvasButtons>
                          )}
                        {selectedElements.length === 1 &&
                          isIframeElement(firstSelectedElement) &&
                          firstSelectedElement.customData?.generationData
                            ?.status === "done" && (
                            <ElementCanvasButtons
                              element={firstSelectedElement}
                              elementsMap={elementsMap}
                            >
                              <ElementCanvasButton
                                title={t("labels.copySource")}
                                icon={copyIcon}
                                checked={false}
                                onChange={() =>
                                  this.onIframeSrcCopy(firstSelectedElement)
                                }
                              />
                              <ElementCanvasButton
                                title="Enter fullscreen"
                                icon={fullscreenIcon}
                                checked={false}
                                onChange={() => {
                                  const iframe =
                                    this.getHTMLIFrameElement(
                                      firstSelectedElement,
                                    );
                                  if (iframe) {
                                    try {
                                      iframe.requestFullscreen();
                                      this.setState({
                                        activeEmbeddable: {
                                          element: firstSelectedElement,
                                          state: "active",
                                        },
                                        selectedElementIds: {
                                          [firstSelectedElement.id]: true,
                                        },
                                        newElement: null,
                                        selectionElement: null,
                                      });
                                    } catch (err: any) {
                                      console.warn(err);
                                      this.setState({
                                        errorMessage:
                                          "Couldn't enter fullscreen",
                                      });
                                    }
                                  }
                                }}
                              />
                            </ElementCanvasButtons>
                          )}
                        {this.state.toast !== null && (
                          <Toast
                            message={this.state.toast.message}
                            onClose={() => this.setToast(null)}
                            duration={this.state.toast.duration}
                            closable={this.state.toast.closable}
                          />
                        )}
                        {this.state.contextMenu && (
                          <ContextMenu
                            items={this.state.contextMenu.items}
                            top={this.state.contextMenu.top}
                            left={this.state.contextMenu.left}
                            actionManager={this.actionManager}
                            onClose={(callback) => {
                              this.setState({ contextMenu: null }, () => {
                                this.focusContainer();
                                callback?.();
                              });
                            }}
                          />
                        )}
                        <StaticCanvas
                          canvas={this.canvas}
                          rc={this.rc}
                          elementsMap={elementsMap}
                          allElementsMap={allElementsMap}
                          visibleElements={visibleElements}
                          sceneNonce={sceneNonce}
                          selectionNonce={
                            this.state.selectionElement?.versionNonce
                          }
                          scale={window.devicePixelRatio}
                          appState={this.state}
                          renderConfig={{
                            imageCache: this.imageCache,
                            isExporting: false,
                            renderGrid: isGridModeEnabled(this),
                            canvasBackgroundColor:
                              this.state.viewBackgroundColor,
                            embedsValidationStatus: this.embedsValidationStatus,
                            elementsPendingErasure: this.elementsPendingErasure,
                            pendingFlowchartNodes:
                              this.flowChartCreator.pendingNodes,
                          }}
                        />
                        {this.state.newElement && (
                          <NewElementCanvas
                            appState={this.state}
                            scale={window.devicePixelRatio}
                            rc={this.rc}
                            elementsMap={elementsMap}
                            allElementsMap={allElementsMap}
                            renderConfig={{
                              imageCache: this.imageCache,
                              isExporting: false,
                              renderGrid: false,
                              canvasBackgroundColor:
                                this.state.viewBackgroundColor,
                              embedsValidationStatus:
                                this.embedsValidationStatus,
                              elementsPendingErasure:
                                this.elementsPendingErasure,
                              pendingFlowchartNodes: null,
                            }}
                          />
                        )}
                        <InteractiveCanvas
                          containerRef={this.excalidrawContainerRef}
                          canvas={this.interactiveCanvas}
                          elementsMap={elementsMap}
                          visibleElements={visibleElements}
                          allElementsMap={allElementsMap}
                          selectedElements={selectedElements}
                          sceneNonce={sceneNonce}
                          selectionNonce={
                            this.state.selectionElement?.versionNonce
                          }
                          scale={window.devicePixelRatio}
                          appState={this.state}
                          device={this.device}
                          renderInteractiveSceneCallback={
                            this.renderInteractiveSceneCallback
                          }
                          handleCanvasRef={this.handleInteractiveCanvasRef}
                          onContextMenu={this.handleCanvasContextMenu}
                          onPointerMove={this.handleCanvasPointerMove}
                          onPointerUp={this.handleCanvasPointerUp}
                          onPointerCancel={this.removePointer}
                          onTouchMove={this.handleTouchMove}
                          onPointerDown={this.handleCanvasPointerDown}
                          onDoubleClick={this.handleCanvasDoubleClick}
                        />
                        {this.state.userToFollow && (
                          <FollowMode
                            width={this.state.width}
                            height={this.state.height}
                            userToFollow={this.state.userToFollow}
                            onDisconnect={this.maybeUnfollowRemoteUser}
                          />
                        )}
                        {this.renderFrameNames()}
                      </ExcalidrawActionManagerContext.Provider>
                      {this.renderEmbeddables()}
                    </ExcalidrawElementsContext.Provider>
                  </ExcalidrawAppStateContext.Provider>
                </ExcalidrawSetAppStateContext.Provider>
              </DeviceContext.Provider>
            </ExcalidrawContainerContext.Provider>
          </AppPropsContext.Provider>
        </AppContext.Provider>
      </div>
    );
  }

  public focusContainer: AppClassProperties["focusContainer"] = () => {
    this.excalidrawContainerRef.current?.focus();
  };

  public getSceneElementsIncludingDeleted = () => {
    return this.scene.getElementsIncludingDeleted();
  };

  public getSceneElements = () => {
    return this.scene.getNonDeletedElements();
  };

  public onInsertElements = (elements: readonly ExcalidrawElement[]) => {
    this.addElementsFromPasteOrLibrary({
      elements,
      position: "center",
      files: null,
    });
  };

  public onExportImage = async (
    type: keyof typeof EXPORT_IMAGE_TYPES,
    elements: ExportedElements,
    opts: { exportingFrame: ExcalidrawFrameLikeElement | null },
  ) => {
    trackEvent("export", type, "ui");
    const fileHandle = await exportCanvas(
      type,
      elements,
      this.state,
      this.files,
      {
        exportBackground: this.state.exportBackground,
        name: this.getName(),
        viewBackgroundColor: this.state.viewBackgroundColor,
        exportingFrame: opts.exportingFrame,
      },
    )
      .catch(muteFSAbortError)
      .catch((error) => {
        console.error(error);
        this.setState({ errorMessage: error.message });
      });

    if (
      this.state.exportEmbedScene &&
      fileHandle &&
      isImageFileHandle(fileHandle)
    ) {
      this.setState({ fileHandle });
    }
  };

  private magicGenerations = new Map<
    ExcalidrawIframeElement["id"],
    MagicGenerationData
  >();

  private updateMagicGeneration = ({
    frameElement,
    data,
  }: {
    frameElement: ExcalidrawIframeElement;
    data: MagicGenerationData;
  }) => {
    if (data.status === "pending") {
      // We don't wanna persist pending state to storage. It should be in-app
      // state only.
      // Thus reset so that we prefer local cache (if there was some
      // generationData set previously)
      mutateElement(
        frameElement,
        { customData: { generationData: undefined } },
        false,
      );
    } else {
      mutateElement(
        frameElement,
        { customData: { generationData: data } },
        false,
      );
    }
    this.magicGenerations.set(frameElement.id, data);
    this.triggerRender();
  };

  public plugins: {
    diagramToCode?: {
      generate: GenerateDiagramToCode;
    };
  } = {};

  public setPlugins(plugins: Partial<App["plugins"]>) {
    Object.assign(this.plugins, plugins);
  }

  private async onMagicFrameGenerate(
    magicFrame: ExcalidrawMagicFrameElement,
    source: "button" | "upstream",
  ) {
    const generateDiagramToCode = this.plugins.diagramToCode?.generate;

    if (!generateDiagramToCode) {
      this.setState({
        errorMessage: "No diagram to code plugin found",
      });
      return;
    }

    const magicFrameChildren = getElementsOverlappingFrame(
      this.scene.getNonDeletedElements(),
      magicFrame,
    ).filter((el) => !isMagicFrameElement(el));

    if (!magicFrameChildren.length) {
      if (source === "button") {
        this.setState({ errorMessage: "Cannot generate from an empty frame" });
        trackEvent("ai", "generate (no-children)", "d2c");
      } else {
        this.setActiveTool({ type: "magicframe" });
      }
      return;
    }

    const frameElement = this.insertIframeElement({
      sceneX: magicFrame.x + magicFrame.width + 30,
      sceneY: magicFrame.y,
      width: magicFrame.width,
      height: magicFrame.height,
    });

    if (!frameElement) {
      return;
    }

    this.updateMagicGeneration({
      frameElement,
      data: { status: "pending" },
    });

    this.setState({
      selectedElementIds: { [frameElement.id]: true },
    });

    trackEvent("ai", "generate (start)", "d2c");
    try {
      const { html } = await generateDiagramToCode({
        frame: magicFrame,
        children: magicFrameChildren,
      });

      trackEvent("ai", "generate (success)", "d2c");

      if (!html.trim()) {
        this.updateMagicGeneration({
          frameElement,
          data: {
            status: "error",
            code: "ERR_OAI",
            message: "Nothing genereated :(",
          },
        });
        return;
      }

      const parsedHtml =
        html.includes("<!DOCTYPE html>") && html.includes("</html>")
          ? html.slice(
            html.indexOf("<!DOCTYPE html>"),
            html.indexOf("</html>") + "</html>".length,
          )
          : html;

      this.updateMagicGeneration({
        frameElement,
        data: { status: "done", html: parsedHtml },
      });
    } catch (error: any) {
      trackEvent("ai", "generate (failed)", "d2c");
      this.updateMagicGeneration({
        frameElement,
        data: {
          status: "error",
          code: "ERR_OAI",
          message: error.message || "Unknown error during generation",
        },
      });
    }
  }

  private onIframeSrcCopy(element: ExcalidrawIframeElement) {
    if (element.customData?.generationData?.status === "done") {
      copyTextToSystemClipboard(element.customData.generationData.html);
      this.setToast({
        message: "copied to clipboard",
        closable: false,
        duration: 1500,
      });
    }
  }

  public onMagicframeToolSelect = () => {
    const selectedElements = this.scene.getSelectedElements({
      selectedElementIds: this.state.selectedElementIds,
    });

    if (selectedElements.length === 0) {
      this.setActiveTool({ type: TOOL_TYPE.magicframe });
      trackEvent("ai", "tool-select (empty-selection)", "d2c");
    } else {
      const selectedMagicFrame: ExcalidrawMagicFrameElement | false =
        selectedElements.length === 1 &&
        isMagicFrameElement(selectedElements[0]) &&
        selectedElements[0];

      // case: user selected elements containing frame-like(s) or are frame
      // members, we don't want to wrap into another magicframe
      // (unless the only selected element is a magic frame which we reuse)
      if (
        !selectedMagicFrame &&
        selectedElements.some((el) => isFrameLikeElement(el) || el.frameId)
      ) {
        this.setActiveTool({ type: TOOL_TYPE.magicframe });
        return;
      }

      trackEvent("ai", "tool-select (existing selection)", "d2c");

      let frame: ExcalidrawMagicFrameElement;
      if (selectedMagicFrame) {
        // a single magicframe already selected -> use it
        frame = selectedMagicFrame;
      } else {
        // selected elements aren't wrapped in magic frame yet -> wrap now

        const [minX, minY, maxX, maxY] = getCommonBounds(selectedElements);
        const padding = 50;

        frame = newMagicFrameElement({
          ...FRAME_STYLE,
          x: minX - padding,
          y: minY - padding,
          width: maxX - minX + padding * 2,
          height: maxY - minY + padding * 2,
          opacity: 100,
          locked: false,
        });

        this.scene.insertElement(frame);

        for (const child of selectedElements) {
          mutateElement(child, { frameId: frame.id });
        }

        this.setState({
          selectedElementIds: { [frame.id]: true },
        });
      }

      this.onMagicFrameGenerate(frame, "upstream");
    }
  };

  private openEyeDropper = ({ type }: { type: "stroke" | "background" }) => {
    jotaiStore.set(activeEyeDropperAtom, {
      swapPreviewOnAlt: true,
      colorPickerType:
        type === "stroke" ? "elementStroke" : "elementBackground",
      onSelect: (color, event) => {
        const shouldUpdateStrokeColor =
          (type === "background" && event.altKey) ||
          (type === "stroke" && !event.altKey);
        const selectedElements = this.scene.getSelectedElements(this.state);
        if (
          !selectedElements.length ||
          this.state.activeTool.type !== "selection"
        ) {
          if (shouldUpdateStrokeColor) {
            this.syncActionResult({
              appState: { ...this.state, currentItemStrokeColor: color },
              storeAction: StoreAction.CAPTURE,
            });
          } else {
            this.syncActionResult({
              appState: { ...this.state, currentItemBackgroundColor: color },
              storeAction: StoreAction.CAPTURE,
            });
          }
        } else {
          this.updateScene({
            elements: this.scene.getElementsIncludingDeleted().map((el) => {
              if (this.state.selectedElementIds[el.id]) {
                return newElementWith(el, {
                  [shouldUpdateStrokeColor ? "strokeColor" : "backgroundColor"]:
                    color,
                });
              }
              return el;
            }),
            storeAction: StoreAction.CAPTURE,
          });
        }
      },
      keepOpenOnAlt: false,
    });
  };

  public dismissLinearEditor = () => {
    setTimeout(() => {
      this.setState({
        editingLinearElement: null,
      });
    });
  };

  public syncActionResult = withBatchedUpdates((actionResult: ActionResult) => {
    if (this.unmounted || actionResult === false) {
      return;
    }

    if (actionResult.storeAction === StoreAction.UPDATE) {
      this.store.shouldUpdateSnapshot();
    } else if (actionResult.storeAction === StoreAction.CAPTURE) {
      this.store.shouldCaptureIncrement();
    }

    let didUpdate = false;

