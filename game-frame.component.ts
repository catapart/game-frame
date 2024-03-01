// import style from './game-frame.component.module.css';

const style = `
:host
{
    display: grid;
    position: relative;
    width: 400px;
    height: 200px;
    background-color: field;
    color: fieldtext;
    border: solid 1px var(--border-color, fieldtext);
    user-select: none;
    touch-action: none;
    box-sizing: border-box;
    contain: content;
    
    /* user-agent input defaults */
    --border-color: rgb(118, 118, 118);
}
@media (prefers-color-scheme: dark) 
{
    :host
    {
        /* user-agent input defaults */
        --border-color: rgb(133, 133, 133);
    }
}

[part="statistics"]
{
    position: absolute;
    top: 0;
    right: 0;
    background-color: rgb(0 0 0 / .3);
    width: 200px;
    font-size: 10px;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

[part="statistics"] ul
,[part="statistics"] dl
,[part="statistics"] ol
,[part="statistics"] dd
{
    padding: 0;
    margin: 0;
    margin-left: 5px;
}

[part="statistics"] dl
{
    display: grid;
    grid-template-columns: auto auto;
    grid-template-rows: repeat(auto-fill, min-content);
}
`;

const componentTemplate = `<style>${style}</style>
<ul part="statistics">
    <li part="performance-item">
        <details part="performance-details" open>
            <summary part="performance-summary">Performance</summary>
            <ul part="performance-items">
                <li part="fps">
                    <span part="fps-label">FPS</span>
                    <span part="fps-value">0 (not started)</span>
                </li>
                <!-- <li part="average-fps">
                    <span part="average-fps-label">Average FPS</span>
                    <span part="average-fps-value"></span>
                </li> -->
            </ul>
        </details>
    </li>
    <li part="inputs-item">
        <details part="inputs-details">
            <summary part="inputs-summary">Input</summary>
            <ul part="inputs"></ul>
        </details>
    </li>
</ul>
<slot></slot>`;

// create a default player to prevent manual
// player set up for single-player games;
const CONTEXT_PLAYER_ID: string = 'CONTEXT';
const DEFAULT_POINTER_ID: number = -1;


const RESIZE_OFFSET = { x: 0, y: 0 };

const COMPONENT_TAG_NAME = 'game-frame';
export class GameFrameComponent extends HTMLElement
{    
    #boundFunctions = 
    {
        document_onKeyDown: this.document_onKeyDown.bind(this),
        document_onKeyUp: this.document_onKeyUp.bind(this),
        document_onPointerDown: this.onPointerDown.bind(this),
        document_onPointerMove: this.onPointerMove.bind(this),
        document_onPointerUp: this.onPointerUp.bind(this)
    };

    #gameLoop?: GameLoop;

    #playerStatisticsMap: Map<string, HTMLElement> = new Map();

    players: Map<string, string> = new Map<string, string>();

    isPaused: boolean = false;
    
    keysDown: Map<string, Set<string>> = new Map([[CONTEXT_PLAYER_ID, new Set()]]);
    gamepadButtonsDown: Map<string, Set<string>> = new Map([[CONTEXT_PLAYER_ID, new Set()]]);
    pointers: Map<string, Map<number, GamePointerData>> = new Map([[CONTEXT_PLAYER_ID, new Map([[DEFAULT_POINTER_ID, new GamePointerData()]])]]);

    onUpdate?: (deltaTime: number) => void|Promise<void>
    fixedUpdateHandler?: () => void|Promise<void>
    onRender?: () => void|Promise<void>;

    allowPointerEventPropagation: boolean = false;

    componentAccessories: Map<string, HTMLElement> = new Map();

    canvas: HTMLCanvasElement|null = null;
    canvasContext: CanvasRenderingContext2D|null = null;

    get defaultPlayerKeys(): Set<string>
    {
        return this.keysDown.get(CONTEXT_PLAYER_ID)!;
    }
    get defaultPointer(): GamePointerData
    {
        return this.defaultPlayerPointers.get(DEFAULT_POINTER_ID)!;
    }
    get defaultPlayerPointers(): Map<number, GamePointerData>
    {
        return this.pointers.get(CONTEXT_PLAYER_ID)!;
    }

    constructor()
    {
        super();
        this.attachShadow({mode: 'open'});

        this.shadowRoot!.innerHTML = componentTemplate;

        if(!this.allowPointerEventPropagation)
        {
            this.addEventListener('contextmenu', event => event.preventDefault());
        }

        const resizeObserver = new ResizeObserver((entries) =>
        {
            for( const entry of entries)
            {
                if(this.canvas != null)
                {
                    this.canvas.setAttribute('width', (entry.contentRect.width - RESIZE_OFFSET.x).toString());
                    this.canvas.setAttribute('height', (entry.contentRect.height - RESIZE_OFFSET.y).toString());
                }
            }
        });
        resizeObserver.observe(this);

        const mutationObserver = new MutationObserver((mutations: MutationRecord[]) =>
        {
            this.#registerCanvas();
        });
        mutationObserver.observe(this, { childList: true });
    }

    async beginGame()
    {
        const fpsString = this.getAttribute('fps') ?? '60';
        let fps = parseFloat(fpsString);
        if(isNaN(fps))
        {
            console.warn('There was an error setting the fps to the specified attribute value. Defaulting to 60 FPS');
            fps = 60;
        }

        fps = fps + (fps*.33); // loop algo renders at about 2/3 of target framerate;

        const timeStep = 1000.0 / fps;

        if(this.fixedUpdateHandler != null)
        {
            this.#gameLoop = new GameLoop(this.update.bind(this), this.render.bind(this), { fixedUpdate: this.fixedUpdateHandler.bind(this), timeStep });  
        }
        else
        {
            this.#gameLoop = new GameLoop(this.update.bind(this), this.render.bind(this), { timeStep });  
        }

        this.#gameLoop.begin();

        this.componentAccessories.set('inputs', this.shadowRoot!.querySelector('[part="inputs"]')!);
        this.componentAccessories.set('fps-value', this.shadowRoot!.querySelector('[part="fps-value"]')!);
    }
    endGame()
    {
        this.#gameLoop?.end();
        document.removeEventListener('keydown', this.#boundFunctions.document_onKeyDown);
        document.removeEventListener('keyup', this.#boundFunctions.document_onKeyUp);
        document.removeEventListener('pointerdown', this.#boundFunctions.document_onPointerDown);
        document.removeEventListener('pointerup', this.#boundFunctions.document_onPointerUp);
    }

    pauseGame()
    {
        this.isPaused = true;
    }
    resumeGame()
    {
        this.isPaused = false;
    }

    update(deltaTime: number)
    {
        if(this.isPaused)
        {
            return;
        }

        if(this.onUpdate != null)
        {
            this.onUpdate(deltaTime);
        }
        this.dispatchEvent(new CustomEvent('update', { detail: { deltaTime: deltaTime } }));
    }

    render()
    {
        if(this.onRender != null)
        {
            this.onRender();
        }

        if(this.getAttribute('stats') != null)
        {
            this.#renderStatistics();
        }

        this.dispatchEvent(new CustomEvent('render'));
    }

    #renderStatistics()
    {
        
        const managers = new Map<string, any>();
        for(let [id, pointerMap] of this.pointers.entries())
        {
            for(const pointerData of pointerMap.values())
            {
                let allButtonsText = Array.from(pointerData.activeButtons.values()).reduce((currentText: string, item, index: number) => 
                { 
                    currentText += ` ${item}`; 
                    if(index < (pointerData.activeButtons.size-1))
                    {
                        currentText += ",";
                    }
                    return currentText;
                }, "[ ");
                allButtonsText += ' ]';
                
                const inputData: any = 
                {
                    id,
                    keys: "[ ]",
                    pointerData: 
                    {
                        id: pointerData.pointerId,
                        x: pointerData.frameX,
                        y: pointerData.frameY,
                        type: pointerData.pointerType,
                        buttons: allButtonsText
                    }, 
                };
                managers.set(id, inputData);
            }
            

        }
        for(let [id, keyCodes] of this.keysDown.entries())
        {
            let keyCodesText = Array.from(keyCodes.values()).reduce((currentText: string, item: string, index: number) => 
            { 
                currentText += ` ${item}`; 
                if(index < (keyCodes.size-1))
                {
                    currentText += ",";
                }
                return currentText;
            }, "[");
            keyCodesText += ' ]';
            
            const inputData: any = 
            {
                id,
                keys: keyCodesText
            };

            const updatedData = Object.assign(managers.get(id) ?? {}, inputData);
            managers.set(id, updatedData);
        }

        for(const [id, inputData] of managers.entries())
        {
            let element = this.#playerStatisticsMap.get(id) ?? this.querySelector<HTMLElement>(`li[data-id="${id}"]`);
            if(element == null)
            {
                element = document.createElement('li');
                element.setAttribute('data-id', id.toString());
                this.#playerStatisticsMap.set(id, element);
                this.componentAccessories.get('inputs')!.appendChild(element);
            }
            element.innerHTML = `<details open> 
                <summary>${id}</summary> 
                <dl part="input-details">
                <dt part="keys-label">keys</dt>
                <dd part="keys-value">${inputData.keys}</dd>
                
                <dt part="pointer-label">pointer</dt>
                <dd part="pointer-value">
                    <dl>
                        <dt part="pointer-x-label">x</dt>
                        <dd part="pointer-x-value">${inputData.pointerData?.x}</dd>
                        <dt part="pointer-y-label">y</dt>
                        <dd part="pointer-y-value">${inputData.pointerData?.y}</dd>
                        <dt part="pointer-type-label">type</dt>
                        <dd part="pointer-type-value">${inputData.pointerData?.type}</dd>
                        <dt part="pointer-buttons-label">buttons</dt>
                        <dd part="pointer-buttons-value">${inputData.pointerData?.buttons}</dd>
                    </dl>
                </dd>
            </dl>`;
        }

        this.componentAccessories.get('fps-value')!.textContent = this.#gameLoop?.fps.toFixed(2) ?? "";
    }

    
    document_onKeyDown(event: KeyboardEvent)
    {
        if(event.repeat == true) { return; }

        let keySet = this.keysDown.get(CONTEXT_PLAYER_ID);
        if(keySet == null) 
        { 
            keySet = new Set();
            this.keysDown.set(CONTEXT_PLAYER_ID, keySet);
        }

        keySet.add(event.code);
    }
    document_onKeyUp(event: KeyboardEvent)
    {
        const keySet = this.keysDown.get(CONTEXT_PLAYER_ID);
        if(keySet == null) { return; }

        keySet.delete(event.code);
    }
    onPointerDown(event: PointerEvent)
    {
        const pointerMap = this.pointers.get(CONTEXT_PLAYER_ID)!;
        const contextPointer = pointerMap.get(DEFAULT_POINTER_ID)!;

        contextPointer.buttons = event.buttons;
        contextPointer.activeButtons = PointerButtonsMap.get(contextPointer.buttons)!;

        contextPointer.frameX = Math.max(Math.min(event.pageX - this.offsetLeft, this.offsetWidth), 0);
        contextPointer.frameY = Math.max(Math.min(event.pageY - this.offsetTop, this.offsetHeight), 0);

        pointerMap.set(DEFAULT_POINTER_ID, contextPointer);

        const currentPointer = pointerMap.get(event.pointerId);
        if(currentPointer != null)
        {
            Object.assign(currentPointer, contextPointer);
            pointerMap.set(currentPointer.pointerId, currentPointer);
        }

        this.pointers.set(CONTEXT_PLAYER_ID, pointerMap);

        if(!this.allowPointerEventPropagation && event.button != 1)
        {
            event.stopPropagation();
            event.preventDefault();
            return false;
        }

        return true;
    }
    onPointerMove(event: PointerEvent)
    {
        const pointerMap = this.pointers.get(CONTEXT_PLAYER_ID)!;
        const contextPointer = pointerMap.get(DEFAULT_POINTER_ID)!;
        
        contextPointer.altitudeAngle = (event as any).altitudeAngle;
        contextPointer.azimuthAngle = (event as any).azimuthAngle;
        contextPointer.clientX = event.clientX;
        contextPointer.clientY = event.clientY;
        contextPointer.height = event.height;
        contextPointer.isPrimary = event.isPrimary;
        contextPointer.layerX = (event as any).layerX;
        contextPointer.layerY = (event as any).layerY;
        contextPointer.movementX = event.movementX;
        contextPointer.movementY = event.movementY;
        contextPointer.offsetX = event.offsetX;
        contextPointer.offsetY = event.offsetY;
        contextPointer.pageX = event.pageX;
        contextPointer.pageY = event.pageY;
        contextPointer.pressure = event.pressure;
        contextPointer.screenX = event.screenX;
        contextPointer.screenY = event.screenY;
        contextPointer.tangentialPressure = event.tangentialPressure;
        contextPointer.tiltX = event.tiltX;
        contextPointer.tiltY = event.tiltY;
        contextPointer.timeStamp = event.timeStamp;
        contextPointer.twist = event.twist;
        contextPointer.width = event.width;
        contextPointer.x = event.x;
        contextPointer.y = event.y;
        contextPointer.buttons = event.buttons;
        contextPointer.activeButtons = PointerButtonsMap.get(contextPointer.buttons)!;


        contextPointer.frameX = Math.max(Math.min(event.pageX - this.offsetLeft, this.offsetWidth), 0);
        contextPointer.frameY = Math.max(Math.min(event.pageY - this.offsetTop, this.offsetHeight), 0);

        pointerMap.set(DEFAULT_POINTER_ID, contextPointer);

        const currentPointer = pointerMap.get(event.pointerId);
        if(currentPointer != null)
        {
            Object.assign(currentPointer, contextPointer);
            pointerMap.set(currentPointer.pointerId, currentPointer);
        }

        this.pointers.set(CONTEXT_PLAYER_ID, pointerMap);

        if(!this.allowPointerEventPropagation)
        {
            event.stopPropagation();
            event.preventDefault();
            return false;
        }

        return true;
    }
    onPointerUp(event: PointerEvent)
    {
        const pointerMap = this.pointers.get(CONTEXT_PLAYER_ID)!;
        const contextPointer = pointerMap.get(DEFAULT_POINTER_ID)!;
        
        contextPointer.activeButtons = PointerButtonsMap.get(0)!;
        contextPointer.buttons = event.buttons;

        contextPointer.frameX = Math.max(Math.min(event.pageX - this.offsetLeft, this.offsetWidth), 0);
        contextPointer.frameY = Math.max(Math.min(event.pageY - this.offsetTop, this.offsetHeight), 0);

        pointerMap.set(DEFAULT_POINTER_ID, contextPointer);

        const currentPointer = pointerMap.get(event.pointerId);
        if(currentPointer != null)
        {
            Object.assign(currentPointer, contextPointer);
            pointerMap.set(currentPointer.pointerId, currentPointer);
        }

        this.pointers.set(CONTEXT_PLAYER_ID, pointerMap);

        if(!this.allowPointerEventPropagation)
        {
            event.stopPropagation();
            event.preventDefault();
            return false;
        }

        return true;
    }

    #registerCanvas()
    {
        this.canvas = this.querySelector('canvas');
        if(this.canvas != null)
        {
            this.canvasContext = this.canvas.getContext('2d');
            this.canvas.setAttribute('width', (this.offsetWidth - RESIZE_OFFSET.x).toString());
            this.canvas.setAttribute('height', (this.offsetHeight - RESIZE_OFFSET.y).toString());
        }
    }

    async connectedCallback() 
    {
        document.addEventListener('keydown', this.#boundFunctions.document_onKeyDown);
        document.addEventListener('keyup', this.#boundFunctions.document_onKeyUp);

        this.addEventListener('pointerdown', this.#boundFunctions.document_onPointerDown);
        this.addEventListener('pointermove', this.#boundFunctions.document_onPointerMove);
        this.addEventListener('pointerup', this.#boundFunctions.document_onPointerUp);
        
        this.#registerCanvas();
    }
    async disconnectedCallback() 
    { 
        this.endGame();
    }
    attributeChangedCallback(attributeName: string, _oldValue: string, newValue: string) 
    {
        if(attributeName == 'open')
        {
            
        }
    }
}

if(!customElements.get(COMPONENT_TAG_NAME) != null)
{
    customElements.define(COMPONENT_TAG_NAME, GameFrameComponent);
}

export type GameLoopOptions =
{
    timeStep: number;
    fixedUpdateStep: number;
    fixedUpdate?: () => void|Promise<void>,
    maxUpdates: number,
}
export const GameLoopOptions_Default: GameLoopOptions = 
{
    timeStep:  1000.0 / 90.0, // render up to 60 times every second; update as many times as possible
    fixedUpdateStep:  1000.0 / 30.0, // force an update 30 times per second
    maxUpdates: 500,
};

export class GameLoop
{
    #onUpdate: (deltaTime: number) => void|Promise<void>;
    #onRender: () => void|Promise<void>;

    #options: GameLoopOptions;

    #loopAnimationFrameId = NaN;
    #previousTime: number = 0.0;
    #currentDelta: number = 0.0;
    #previousFrameTime: number = 0.0;
    #frames: number = 0.0;

    #fixedUpdateInterval?: ReturnType<typeof setInterval>;

    isPaused: boolean = false;
    fps: number = 0.0;

    constructor(onUpdate: (deltaTime: number) => void, onRender: () => void, options?: Partial<GameLoopOptions>)
    {
        this.#onUpdate = onUpdate;
        this.#onRender = onRender;
        this.#options = Object.assign(GameLoopOptions_Default, options);
    }

    begin()
    {
        if(this.#options.fixedUpdate != null)
        {
            this.#fixedUpdateInterval = setInterval(this.#options.fixedUpdate, this.#options.fixedUpdateStep);
        }
        window.requestAnimationFrame((time) => 
        {
            this.#previousTime = time;
            this.#previousFrameTime = performance.now();
            this.#loopAnimationFrameId = window.requestAnimationFrame(this.#onLoop.bind(this));
        });
    }
    end()
    {
        if(this.#fixedUpdateInterval != null)
        {
            clearInterval(this.#fixedUpdateInterval);
        }
        window.cancelAnimationFrame(this.#loopAnimationFrameId);
        this.#loopAnimationFrameId = NaN;
    }

    #onLoop(currentTime: number)
    {
        if(isNaN(this.#loopAnimationFrameId))
        {
            // early exit if loop has been ended
            return;
        }
  
        if (currentTime < this.#previousTime + this.#options.timeStep)
        {
            this.#loopAnimationFrameId = requestAnimationFrame(this.#onLoop.bind(this));
            return;
        }
        this.#currentDelta += currentTime - this.#previousTime;
        this.#previousTime = currentTime;

        if (currentTime > this.#previousFrameTime + 1000) 
        {
            this.fps = 0.25 * this.#frames + 0.75 * this.fps;

            this.#previousFrameTime = currentTime;
            this.#frames = 0;
        }
        this.#frames++;

        var numUpdateSteps = 0;
        while (this.#currentDelta >= this.#options.timeStep)
        {
            this.#onUpdate(this.#options.timeStep);
            this.#currentDelta -= this.#options.timeStep;
            if (++numUpdateSteps >= this.#options.maxUpdates)
            {
                console.info('Max updates reached; Forcing render before continuing.');
                break;
            }
        }

        this.#onRender();

        this.#loopAnimationFrameId = requestAnimationFrame(this.#onLoop.bind(this));
    }
}

export class GamePointerData
{
    altitudeAngle?: number = 0;
    azimuthAngle?: number = 0;
    buttons: number = 0;
    activeButtons: Set<'left'|'right'|'middle'|'back'|'forward'|number> = new Set();
    clientX: number = 0;
    clientY: number = 0;
    height: number = 0;
    isPrimary: boolean = false;
    layerX?: number = 0;
    layerY?: number = 0;
    movementX: number = 0;
    movementY: number = 0;
    offsetX: number = 0;
    offsetY: number = 0;
    pageX: number = 0;
    pageY: number = 0;
    pointerId: number = 0;
    pointerType: string = "";
    pressure: number = 0;
    screenX: number = 0;
    screenY: number = 0;
    tangentialPressure: number = 0;
    tiltX: number = 0;
    tiltY: number = 0;
    timeStamp: number = 0;
    twist: number = 0;
    width: number = 0;
    x: number = 0;
    y: number = 0;
    frameX: number = 0;
    frameY: number = 0;

    constructor(event?: PointerEvent)
    {
        this.altitudeAngle = (event as any)?.altitudeAngle ?? this ;
        this.azimuthAngle = (event as any)?.azimuthAngle ?? this ;
        this.buttons = event?.buttons ?? this.buttons ;
        this.clientX = event?.clientX ?? this.clientX ;
        this.clientY = event?.clientY ?? this.clientY ;
        this.height = event?.height ?? this.height ;
        this.isPrimary = event?.isPrimary ?? this.isPrimary ;
        this.layerX = (event as any)?.layerX ?? this ;
        this.layerY = (event as any)?.layerY ?? this ;
        this.movementX = event?.movementX ?? this.movementX ;
        this.movementY = event?.movementY ?? this.movementY ;
        this.offsetX = event?.offsetX ?? this.offsetX ;
        this.offsetY = event?.offsetY ?? this.offsetY ;
        this.pageX = event?.pageX ?? this.pageX ;
        this.pageY = event?.pageY ?? this.pageY ;
        this.pointerId = event?.pointerId ?? this.pointerId ;
        this.pointerType = event?.pointerType ?? this.pointerType ;
        this.pressure = event?.pressure ?? this.pressure ;
        this.screenX = event?.screenX ?? this.screenX ;
        this.screenY = event?.screenY ?? this.screenY ;
        this.tangentialPressure = event?.tangentialPressure ?? this.tangentialPressure ;
        this.tiltX = event?.tiltX ?? this.tiltX ;
        this.tiltY = event?.tiltY ?? this.tiltY ;
        this.timeStamp = event?.timeStamp ?? this.timeStamp ;
        this.twist = event?.twist ?? this.twist ;
        this.width = event?.width ?? this.width ;
        this.x = event?.x ?? this.x;
        this.y = event?.y ?? this.y;
    }
}

export type PointerButtonIdentifier = 'left'|'middle'|'right'|'back'|'forward'|number;

export const PointerButtonsMap = new Map<number, Set<PointerButtonIdentifier>>(
    [
        [0, new Set()],
        [1, new Set(['left'])],
        [2, new Set(['right'])],
        [3, new Set(['left', 'right'])],
        [4, new Set(['middle'])],
        [5, new Set(['left', 'middle'])],
        [6, new Set(['right', 'middle'])],
        [7, new Set(['left', 'right', 'middle'])],
        [8, new Set(['back'])],
        [9, new Set(['left', 'back'])],
        [10, new Set(['right', 'back'])],
        [11, new Set(['left', 'right', 'back'])],
        [12, new Set(['middle', 'back'])],
        [13, new Set(['left', 'middle', 'back'])],
        [14, new Set(['right', 'middle', 'back'])],
        [15, new Set(['left', 'right', 'middle', 'back'])],
        [16, new Set(['forward'])],
        [17, new Set(['left', 'forward'])],
        [18, new Set(['right', 'forward'])],
        [19, new Set(['left', 'right', 'forward'])],
        [20, new Set(['middle', 'forward'])],
        [21, new Set(['left', 'middle', 'forward'])],
        [22, new Set(['right', 'middle', 'forward'])],
        [23, new Set(['left', 'right', 'middle', 'forward'])],
        [24, new Set(['back', 'forward'])],
        [25, new Set(['left', 'back', 'forward'])],
        [26, new Set(['right', 'back', 'forward'])],
        [27, new Set(['left', 'right', 'back', 'forward'])],
        [28, new Set(['middle', 'back', 'forward'])],
        [29, new Set(['left', 'middle', 'back', 'forward'])],
        [30, new Set(['right', 'middle', 'back', 'forward'])],
        [31, new Set(['left', 'right', 'middle', 'back', 'forward'])]
    ]
);