export class Scene {
  mount(_hostEl) {
    throw new Error("Scene.mount(hostEl) not implemented");
  }

  applySnapshot(_snapshot) {
    // optional
  }

  tick(_dt) {
    // optional
  }

  unmount() {
    // optional
  }
}
