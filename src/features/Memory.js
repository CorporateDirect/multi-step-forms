class Memory {
  /**
   * @param {HTMLFormElement} formElement
   * @param {import('../core/StepManager.js').default} stepManager
   * @param {number} debounceMs
   */
  constructor(formElement, stepManager, debounceMs = 500) {
    this.form = formElement;
    this.stepManager = stepManager;
    this.debounceMs = debounceMs;
    this.storageKey = `form-memory-${formElement.id || 'default'}`;

    this.data = this._loadFromStorage();
    this._saveTimeout = null;

    this.attachListeners();

    // Restore saved values on init
    this.restoreValues();
  }

  /**
   * Attach input listeners for autosave.
   */
  attachListeners() {
    this.form.addEventListener('change', (e) => {
      const target = /** @type {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} */ (e.target);
      if (!target.name) return;
      this._saveFromElement(target);
    });

    this.form.addEventListener('input', (e) => {
      const target = /** @type {HTMLInputElement|HTMLTextAreaElement} */ (e.target);
      if (!target.name) return;
      // For text inputs / textarea we want real-time saving
      if (target.tagName.toLowerCase() === 'textarea' || target.type === 'text' || target.type === 'email' || target.type === 'number' || target.type === 'url' || target.type === 'tel') {
        this._saveFromElement(target);
      }
    });
  }

  /**
   * Save a single field value with metadata.
   * @param {string} name
   * @param {any} value
   * @param {Partial<{stepIndex:number, fieldType:string, isVisible:boolean}>} meta
   */
  saveField(name, value, meta = {}) {
    if (!name) return;
    if (!this.data.values) this.data.values = {};

    this.data.values[name] = {
      value,
      timestamp: Date.now(),
      ...meta
    };

    this._debouncedPersist();
  }

  /** Save all current form field values */
  saveAllFields() {
    const elements = this.form.elements;
    Array.from(elements).forEach(el => {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) return;
      if (!el.name) return;
      this._saveFromElement(el);
    });
    // Force immediate persist after iterating all fields
    this._persistToStorage();
  }

  /**
   * Get all saved values as simple map { fieldName: value }
   */
  getAllValues() {
    const result = {};
    Object.keys(this.data.values || {}).forEach(key => {
      result[key] = this.data.values[key].value;
    });
    return result;
  }

  /** Clear stored data */
  clear() {
    localStorage.removeItem(this.storageKey);
    this.data = { values: {}, lastUpdated: Date.now() };
  }

  /**
   * Restore values to the form from localStorage.
   */
  restoreValues() {
    const entries = this.data.values || {};
    Object.keys(entries).forEach(name => {
      const saved = entries[name];
      const fieldType = saved.fieldType;
      const elements = this.form.querySelectorAll(`[name="${name}"]`);
      if (!elements.length) return;

      if (fieldType === 'checkbox') {
        const valuesArr = Array.isArray(saved.value) ? saved.value : [];
        elements.forEach(el => {
          if (!(el instanceof HTMLInputElement)) return;
          el.checked = valuesArr.includes(el.value);
        });
      } else if (fieldType === 'radio') {
        elements.forEach(el => {
          if (!(el instanceof HTMLInputElement)) return;
          el.checked = el.value === saved.value;
          if (el.checked) {
            // trigger change to inform ConditionalLogic
            el.dispatchEvent(new Event('change'));
          }
        });
      } else if (fieldType === 'select') {
        const select = /** @type {HTMLSelectElement} */ (elements[0]);
        if (Array.isArray(saved.value)) {
          Array.from(select.options).forEach(opt => {
            opt.selected = saved.value.includes(opt.value);
          });
        } else {
          select.value = saved.value;
        }
        select.dispatchEvent(new Event('change'));
      } else {
        // text-like
        const el = /** @type {HTMLInputElement|HTMLTextAreaElement} */ (elements[0]);
        el.value = saved.value;
        el.dispatchEvent(new Event('input'));
      }
    });
  }

  // Helpers to derive metadata
  _getFieldType(el) {
    if (el instanceof HTMLSelectElement) return 'select';
    if (el instanceof HTMLTextAreaElement) return 'textarea';
    if (el.type === 'checkbox') return 'checkbox';
    if (el.type === 'radio') return 'radio';
    return 'text';
  }

  _getStepIndex(el) {
    if (!this.stepManager) return -1;
    const stepEl = el.closest('[data-form="step"]');
    if (!stepEl) return -1;
    const stepObj = this.stepManager.steps.find(s => s.element === stepEl);
    return stepObj ? stepObj.index : -1;
  }

  _isElementVisible(el) {
    // Basic check – element is in layout (display not none and in DOM)
    return !!(el.offsetParent !== null);
  }

  _saveFromElement(el) {
    if (!el || !el.name) return;
    const name = el.name;
    const fieldType = this._getFieldType(el);
    const stepIndex = this._getStepIndex(el);
    const isVisible = this._isElementVisible(el);

    let value;
    if (fieldType === 'checkbox') {
      const groupEls = this.form.querySelectorAll(`input[type="checkbox"][name="${name}"]`);
      value = Array.from(groupEls)
        .filter(c => c.checked)
        .map(c => c.value);
    } else if (fieldType === 'radio') {
      if (el.checked) {
        value = el.value;
      } else {
        // keep previous
        value = this.data.values?.[name]?.value || '';
      }
    } else if (fieldType === 'select') {
      const select = /** @type {HTMLSelectElement} */ (el);
      if (select.multiple) {
        value = Array.from(select.selectedOptions).map(opt => opt.value);
      } else {
        value = select.value;
      }
    } else {
      // text, textarea
      value = el.value;
    }

    this.saveField(name, value, { stepIndex, fieldType, isVisible });
  }

  // Internal helpers
  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Memory: failed to parse stored data', e);
    }
    return {
      values: {},
      lastUpdated: Date.now()
    };
  }

  _debouncedPersist() {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => {
      this._persistToStorage();
    }, this.debounceMs);
  }

  _persistToStorage() {
    this.data.lastUpdated = Date.now();
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
      console.log('Memory: data persisted', this.data);
    } catch (e) {
      console.warn('Memory: failed to save data', e);
    }
  }
}

export default Memory; 