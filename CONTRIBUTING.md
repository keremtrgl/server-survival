# Contributing to Server Survival

First off, thanks for taking the time to contribute! 🎉

The following is a set of guidelines for contributing to Server Survival. These are mostly guidelines, not rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/your-username/server-survival.git
    cd server-survival
    ```
3.  **Create a branch** for your feature or bugfix:
    ```bash
    git checkout -b feature/amazing-feature
    ```

## Development Workflow

This project uses vanilla JavaScript, HTML, and CSS with Three.js. No build step is currently required for the core game, but we use a modular structure in `src/`.

1.  Serve the folder — `python3 -m http.server 8000` — and open `http://localhost:8000`.

    **Not `file://`.** The game is native ES modules, and browsers fetch module scripts in CORS mode, so a `file://` origin is blocked outright. Double-clicking `index.html` gives you the UI shell over an empty canvas, which looks exactly like a broken checkout. It is not; it was loaded wrong.
    With Node installed, `npm run serve` does the same at `http://127.0.0.1:4173`.
2.  Make changes in the `src/` directory or `game.js`.
3.  Reload the browser to see your changes.

### Checks

Run these before opening a pull request. CI runs all of them.

| Command | What it proves |
| --- | --- |
| `npm run check` | ESLint plus the Vitest unit and headless-simulation suites (`tests/`). |
| `npm run test:e2e` | Playwright browser tests (`e2e/`): boot with WebGL, real clicks and taps, layout at desktop and phone sizes, axe-core accessibility scans, save/load, languages, GPU-resource leaks, and visual regression. Run `npx playwright install chromium` once first. |
| `npm run check:css` | The committed `vendor/tailwind/tailwind.css` matches the classes in the source. |

- **Changed Tailwind classes?** Run `npm run build:css` and commit `vendor/tailwind/tailwind.css`. The game loads that compiled file; there is no Tailwind at runtime.
- **Changed the UI on purpose?** Re-record the visual baselines with `npm run test:e2e:update` on Linux (the CI platform), review the PNGs in `e2e/__screenshots__/`, and commit them. The visual tests pin the font and hide the WebGL canvas so baselines match across machines.
- **Adding a string?** Add the key to `src/locales/en.js` and to every other locale. The locale tests fail on any missing key or changed `{placeholder}`.
- **Performance work?** Open the game with `?perf=1` for FPS, frame-time percentiles and three.js renderer stats.

### Project Structure

*   `index.html`: Main entry point and UI structure.
*   `vendor/`: Third-party front-end code served by the game itself (three.js r128 and the compiled Tailwind CSS). Nothing is loaded from a CDN.
*   `tests/`: Vitest unit and simulation tests. `e2e/`: Playwright browser tests.
*   `game.js`: Main game loop and logic (currently under refactoring).
*   `src/`: Modularized code.
    *   `entities/`: Game entities like `Service` and `Request`.
    *   `services/`: Systems like `SoundService`.
    *   `config.js`: Game configuration constants.
    *   `state.js`: Global game state.

## Code Style

*   **JavaScript**: Use modern ES6+ syntax (const/let, arrow functions, classes).
*   **Formatting**: Keep code clean and readable.
*   **Comments**: Comment complex logic, but aim for self-documenting code.

## Pull Request Process

1.  Ensure your code works and doesn't break existing features.
2.  Update the `README.md` if you change any game mechanics or controls.
3.  Open a Pull Request against the `main` branch.
4.  Describe your changes clearly in the PR description.

## Reporting Bugs

Bugs are tracked as GitHub issues. When filing an issue, please include:

*   A clear title and description.
*   Steps to reproduce the bug.
*   Expected vs. actual behavior.
*   Screenshots if applicable.

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
