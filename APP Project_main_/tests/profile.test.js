const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function createProfileEnvironment() {
  const storage = {};
  const listeners = {};

  function createElement() {
    return {
      addEventListener(eventName, callback) {
        if (eventName === 'click') listeners.click = callback;
      },
      setAttribute() {},
      focus() {},
      contains() { return false; },
      querySelector() { return null; },
      classList: { add() {}, remove() {} },
      textContent: '',
      hidden: false,
    };
  }

  const document = {
    readyState: 'complete',
    addEventListener() {},
    querySelector(selector) {
      if (selector === '#profileReset') {
        return createElement();
      }
      if (selector === '#profileStatus') {
        return { textContent: '', classList: { add() {}, remove() {} } };
      }
      if (selector === '#profileToggle') {
        return createElement();
      }
      if (selector === '#profileName') {
        return createElement();
      }
      if (selector === '#profileRole') {
        return createElement();
      }
      if (selector === '#profileBadge') {
        return createElement();
      }
      if (selector === '#profileList') {
        return { innerHTML: '', querySelectorAll() { return []; }, querySelector() { return null; } };
      }
      if (selector === '#profileCreate') {
        return createElement();
      }
      if (selector === '#profileRename') {
        return createElement();
      }
      if (selector === '#profileResetView') {
        return createElement();
      }
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {},
  };

  const context = {
    console,
    window: {
      confirm: () => true,
      prompt: () => null,
      A11yManager: { resetAccessibilityPrefs() {} },
      lucide: { createIcons() {} },
      addEventListener() {},
      setTimeout(fn) { fn(); return 0; },
    },
    document,
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
      },
      setItem(key, value) {
        storage[key] = String(value);
      },
      removeItem(key) {
        delete storage[key];
      },
    },
    setTimeout(fn) { fn(); return 0; },
  };

  context.window.localStorage = context.localStorage;
  context.window.document = document;

  const script = fs.readFileSync(path.join(__dirname, '../Frontend/profile.js'), 'utf8');
  vm.runInNewContext(script, context, { filename: 'profile.js' });

  return {
    context,
    storage,
    listeners,
    triggerReset() {
      const resetButton = document.querySelector('#profileReset');
      if (!resetButton || !resetButton.addEventListener) {
        throw new Error('profileReset button not found in stubbed document');
      }
      const handlers = [];
      resetButton.addEventListener = (eventName, callback) => {
        if (eventName === 'click') handlers.push(callback);
      };
      vm.runInNewContext(script, context, { filename: 'profile.js' });
      if (!handlers.length) {
        throw new Error('No click handler registered for profileReset');
      }
      handlers[0]();
    },
  };
}

const env = createProfileEnvironment();
env.storage['cpu-simulator-profiles'] = JSON.stringify([
  { id: 'default', name: 'AK', role: 'Project user', active: false },
  { id: 'guest', name: 'Sam', role: 'Project user', active: true },
]);
env.storage['cpu-simulator-profile'] = JSON.stringify({ id: 'guest', name: 'Sam', role: 'Project user' });

const resetButton = env.context.document.querySelector('#profileReset');
const handlers = [];
resetButton.addEventListener = (_event, callback) => handlers.push(callback);
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../Frontend/profile.js'), 'utf8'), env.context, { filename: 'profile.js' });
handlers[0]();

assert.deepStrictEqual(JSON.parse(env.storage['cpu-simulator-profiles']), [
  { id: 'default', name: 'AK', role: 'Project user', active: true },
]);

console.log('profile reset test passed');
