# Magnit Game Frame Custom Element
A single-file custom-element that exposes an Update and Render loop, manages players along with their inputs, and will adjust a child `canvas` element to fit the element's width and height.

### Quick Start
##### HTML
```html
<game-frame></game-frame>
```
##### TS
```ts
// js
import 'path/to/game-frame.component.js';
// npm: 
// import 'magnit-game-frame/index';
// import { GameFrameComponent[, etc...] } from 'magnit-game-frame';

/* [...] */

const gameFrame = document.querySelector('game-frame');
gameFrame.onUpdate((deltaTime: number) =>
{
    // as fast as possible
    // warning: console.log, in this function, will slow down or crash your page.
});
gameFrame.onRender((deltaTime: number) =>
{
    // at the designated fps; defaults to 60 times each second
});
```

### Features
- `onUpdate`
- `onRender`
- `onFixedUpdate`
- `fps` attribute
- 


### Simple Interactive Demo
##### HTML
```html
<game-frame fps="30">
    <canvas></canvas>
</game-frame>
```
##### TS
```ts
let upCommandIsActive: boolean = false;
let downCommandIsActive: boolean = false;
let leftCommandIsActive: boolean = false;
let rightCommandIsActive: boolean = false;

const position: { x: number, y: number } = { x: 100, y: 100 };
const size: { width: number, height: number } = { width: 50, height: 50 };

let currentDeltaTime = 0;

const gameFrame = this.shadowRoot!.querySelector('game-frame') as GameFrameComponent;
gameFrame.onUpdate = (deltaTimeMs: number) =>
{
    currentDeltaTime = deltaTimeMs;
    upCommandIsActive    = gameFrame.defaultPlayerKeys.has('ArrowUp')    || gameFrame.defaultPlayerKeys.has('KeyW');
    downCommandIsActive  = gameFrame.defaultPlayerKeys.has('ArrowDown')  || gameFrame.defaultPlayerKeys.has('KeyS');
    leftCommandIsActive  = gameFrame.defaultPlayerKeys.has('ArrowLeft')  || gameFrame.defaultPlayerKeys.has('KeyA');
    rightCommandIsActive = gameFrame.defaultPlayerKeys.has('ArrowRight') || gameFrame.defaultPlayerKeys.has('KeyD');

    const inputSpeed = (gameFrame.defaultPlayerKeys.has('ShiftLeft')) ? .5 : .25;
    if(upCommandIsActive)    { position.y -= inputSpeed * deltaTimeMs; }            
    if(downCommandIsActive)  { position.y += inputSpeed * deltaTimeMs; }
    if(leftCommandIsActive)  { position.x -= inputSpeed * deltaTimeMs; }
    if(rightCommandIsActive) { position.x += inputSpeed * deltaTimeMs; }
}
gameFrame.onRender = () =>
{
    if(gameFrame.canvasContext == null || gameFrame.canvas == null)
    {
        return;
    }

    gameFrame.canvasContext.clearRect(0, 0, gameFrame.canvas.width, gameFrame.canvas.height);

    // draw rectangle
    gameFrame.canvasContext.fillStyle = '#ff303f';
    gameFrame.canvasContext.fillRect(position.x - size.width/2, position.y - size.height/2, size.width, size.height);

    // draw circle
    gameFrame.canvasContext.fillStyle = '#30ff3f';
    gameFrame.canvasContext.beginPath();
    gameFrame.canvasContext.arc(position.x, position.y, size.width/2, 0, Math.PI * 2);
    gameFrame.canvasContext.fill();

    // draw triangle
    gameFrame.canvasContext.fillStyle = '#3f30ff';
    gameFrame.canvasContext.beginPath();
    gameFrame.canvasContext.moveTo(position.x, position.y - size.height/2);                // top point
    gameFrame.canvasContext.lineTo(position.x - size.width/2, position.y + size.height/2); // left point
    gameFrame.canvasContext.lineTo(position.x + size.width/2, position.y + size.height/2); // right point
    gameFrame.canvasContext.fill();
}
gameFrame.beginGame();
```