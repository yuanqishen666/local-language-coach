/**
 * Whether the app runs from its own folder on the learner's computer. That is what the settings page means when
 * it names the files in that folder and offers the app to other devices at home or over the internet, so those
 * parts are left out once a program that serves the app some other way has said so, before the app starts.
 */
let ownFolder = true

export function servedWithoutOwnFolder() {
  ownFolder = false
}

export function runsFromOwnFolder() {
  return ownFolder
}

/**
 * Whether the learner runs the app for themselves: chooses the model and pays for it, keeps the backups, and decides
 * who else learns on it. A program that serves the app to people who sign in to it, with a model of its own, says
 * otherwise before the app starts. The settings then keep to what is a learner's own (the languages, the voice, the
 * level, what is remembered) and nothing asks what the model requests came to.
 */
let selfRun = true

export function servedByHost() {
  selfRun = false
}

export function runsForOneself() {
  return selfRun
}
