# Newsdesk

**English** · [简体中文](README.zh-CN.md)

Newsdesk is a local writing workspace for journalists. Keep sources, research notes and drafts together in a project on your Mac. Search for reporting material or import your own, choose a writing style or extract one from samples, then draft a story and review suggested edits one passage at a time.

## Run on a Mac

The source build has been tested on **Apple Silicon** with Node.js 24.21.0. Intel Mac users can try the same steps with Intel-compatible tools. That configuration still needs testing.

### First launch

1. Install Node.js 22.13 or later with npm, and install uv. Open a new Terminal window and check that each command below prints a version. macOS also needs its standard `tar` utility. [Node.js downloads](https://nodejs.org/en/download) · [uv installation guide](https://docs.astral.sh/uv/getting-started/installation/)

   ```sh
   node -v
   npm -v
   uv --version
   ```

2. On this repository's GitHub page, choose **Code → Download ZIP**, then unzip it in Finder. In Terminal, type `cd` followed by a space, drag the extracted folder into the window and press Return. The folder should contain `package.json`.

3. Run these commands in order. The first two need internet access. They install the app dependencies and set up the built-in SearXNG search service and its Python environment.

   ```sh
   npm ci
   SEARCH_UV="$(command -v uv)" npm run setup:search
   npm start
   ```

4. Open [Newsdesk on this Mac](http://127.0.0.1:43219/) in your browser. Keep Terminal open while you work.

### Open it again

In the same project folder, run `npm start` and open the local address above. To stop the app and its search service, press **Control-C** in Terminal. Closing the browser tab leaves the service running.

## Try your first story

1. **Connect a model.** Under **Settings → Models**, enter the API base URL, model ID and API key if your provider requires one. Newsdesk uses a Chat Completions-compatible service that you supply. If your model server is running on this Mac at port 1234, its base URL might be `http://127.0.0.1:1234/v1`. Use the connection test to check your settings.
2. **Collect material.** Create a project. In **Source library**, upload a document or paste your notes. In **Research**, enter a topic to find more material. Review a result and add it to the library. Research uses your model to rewrite queries and score results.
3. **Write and revise.** Open **Write**, select the sources, writing style and output language, describe the story and run the task. Select a passage in the draft to request an edit and compare it before accepting. To check autosave, reopen the project after restarting Newsdesk.

The interface supports English, Spanish, French, Simplified Chinese, Japanese and Korean.

## Storage, backups and privacy

All projects share one local SQLite library. The default file is `~/Documents/Newsdesk/Newsdesk.newsdesk`. Use **Settings → System → Local storage** to change the folder. **Backup history** lets you back up or restore the whole library. Backups are in the adjacent `Newsdesk Backups/` folder. Restoring creates a snapshot of the current library first. To move to another Mac, stop Newsdesk before copying the library and the backups you want to keep.

API keys are stored in the current browser and may need to be entered again if you clear its data. Online searches send queries to search providers and request pages from source websites. When you run a remote model task, the configured service receives the prompt and the material needed for that task, such as selected sources, draft context or writing samples.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Terminal cannot find `node`, `npm` or `uv` | Install the missing prerequisite, reopen Terminal, then repeat the version checks. |
| The local page does not open | Check that `npm start` is still running. If the port is in use, run `PORT=43220 npm start` and open [port 43220](http://127.0.0.1:43220/). |
| Built-in search fails to start | Rerun the `setup:search` command above in the project folder. If the worker starts and fails, check `.runtime/search/service.log`. |
| A result opens but its article text cannot be imported | Dynamic pages may require Chrome or Chromium on the Mac. For a custom installation, set `NEWSROOM_BROWSER_PATH` to the browser executable before starting Newsdesk. You can also open the original article and paste its text. |

## Development and license

Run `npm test` for unit and integration tests. With Google Chrome installed, run `npm run verify:ux` for browser checks using a temporary library. [Verification record](docs/VERIFICATION.md)

Newsdesk's own code is available under the [MIT License](LICENSE). Bundled assets and third-party components have their own terms. [Third-party notices](THIRD-PARTY-NOTICES.md)
