(function(){

// ---- core/FormManager.js ----








class FormManager {
  /**
   * @param {HTMLFormElement} formElement
   */
  constructor(formElement, options = {}) {
    if (!(formElement instanceof HTMLFormElement)) {
      throw new Error('FormManager expects a form element');
    }

    this.form = formElement;
    this.currentStep = 0;
    this.history = [0];
    this.options = Object.assign({
      progress: true
    }, options);

    this.stepManager = new StepManager(this.form);
    this.navigation = new Navigation(this.stepManager);

    // Conditional logic setup
    this.conditionalLogic = new ConditionalLogic(this.stepManager);

    // Autosave memory feature
    this.memory = new Memory(this.form, this.stepManager);

    // Validation
    this.validation = new Validation(this.form);

    this.attachGlobalListeners();

    // Listen for editField events
    this.form.addEventListener('editField', (e) => {
      const { fieldName } = e.detail;
      this.editField(fieldName);
    });

    this.editContext = null;

    const summaryContainer = this.form.querySelector('[data-form="summary"]');
    if (summaryContainer) {
      this.summary = new Summary(this.stepManager, this.memory, summaryContainer);
      this.summary.update();
    }

    // Redirect navigation events to FormManager so we keep state in sync
    this.navigation.handleNext = () => {
      const currentStepEl = this.stepManager.steps[this.currentStep].element;
      const valid = this.validation.validateStep(currentStepEl);
      if (valid) {
        this.nextStep();
      } else if (this.navigation.triggerErrorShake) {
        this.navigation.triggerErrorShake();
      }
    };
    this.navigation.handlePrevious = () => {
      this.previousStep();
    };

    // Progress indicator
    if (this.options.progress) {
      this._initProgressBar();
    }
  }

  _initProgressBar() {
    // create container at top of form
    this.progressContainer = document.createElement('div');
    this.progressContainer.className = 'progress-container';
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'progress-bar';
    this.progressContainer.appendChild(this.progressBar);
    this.form.prepend(this.progressContainer);
    this._updateProgressBar();
  }

  _updateProgressBar() {
    if (!this.progressBar) return;
    this.progressBar.style.width = this.getProgressPercent() + '%';
  }

  getProgressPercent() {
    const total = this.stepManager.steps.length;
    return Math.round(((this.currentStep + 1) / total) * 100);
  }

  /**
   * Initialize the multi-step form.
   */
  init() {
    this.stepManager.discoverSteps();
    this.goToStep(0);
  }

  /**
   * Navigate to a specific step index.
   * @param {number} index
   */
  goToStep(index) {
    const prev = this.currentStep;
    const total = this.stepManager.steps.length;
    if (index < 0 || index >= total) return;

    console.log(`FormManager: navigating from step ${this.currentStep} to step ${index}`);

    this.currentStep = index;
    // Avoid recording duplicates
    const lastRecorded = this.history[this.history.length - 1];
    if (lastRecorded !== index) {
      this.history.push(index);
    }

    // Update UI
    this.stepManager.showStep(index);
    this.navigation.currentIndex = index;
    this.navigation.updateButtonVisibility();
    if (this.progressBar) this._updateProgressBar();

    if (this.summary && prev !== index) {
      this.summary.update();
    }

    // clear highlight when step changes
    if (prev !== index) {
      clearHighlight(this.form);
      this._removeEditBar();
    }

    // Dispatch custom event
    const event = new CustomEvent('stepChange', { detail: { currentStep: index, totalSteps: this.stepManager.steps.length }});
    this.form.dispatchEvent(event);

    // form complete if last step and index stays same after next attempt
    if (index === this.stepManager.steps.length - 1 && prev === index) {
      const completeEvt = new Event('formComplete');
      this.form.dispatchEvent(completeEvt);
    }
  }

  /** Advance to the next step */
  nextStep() {
    console.log('FormManager: nextStep() called');
    this.goToStep(this.currentStep + 1);
  }

  /** Go back to the previous step */
  previousStep() {
    console.log('FormManager: previousStep() called');
    this.goToStep(this.currentStep - 1);
  }

  /**
   * Returns the current step descriptor object.
   */
  getCurrentStep() {
    return this.stepManager.steps[this.currentStep] || null;
  }

  /** edit given field name */
  editField(fieldName) {
    if (!this.summary) return;
    const loc = this.summary.getFieldLocation(fieldName);
    if (!loc) return;

    // store context
    this.editContext = { fieldName };

    // Ensure correct conditional wrapper displayed
    if (loc.wrapperAnswer !== null) {
      this.stepManager.selectedAnswer = loc.wrapperAnswer;
    }

    this.goToStep(loc.stepIndex);

    setTimeout(() => {
      const field = this.form.querySelector(`[name="${fieldName}"]`);
      if (field) {
        highlightField(field);
        this._showEditBar(field);
      }
      this.editContext = null;
    }, 100);
  }

  _showEditBar(field) {
    if (this.editBar) this._removeEditBar();

    const label = field.placeholder || field.dataset.label || field.name;
    console.log(`Edit mode started for field "${field.name}"`);
    const bar = document.createElement('div');
    bar.className = 'edit-mode-bar';
    bar.innerHTML = `<span>Editing: <strong>${label}</strong></span>`;

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'save-return-btn';
    saveBtn.textContent = 'Save & Return to Summary';
    bar.appendChild(saveBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'cancel-edit-btn';
    cancelBtn.textContent = 'Cancel';
    bar.appendChild(cancelBtn);

    const wrapper = field.closest('[data-answer]') || field.parentElement;
    wrapper.prepend(bar);

    const onComplete = () => {
      if (this.validation.validateField(field)) {
        console.log(`Field "${field.name}" validated, saving and returning to summary`);
        this.memory.saveAllFields();
        bar.classList.add('success');
        // update summary immediately
        if (this.summary) this.summary.update();
        setTimeout(() => {
          this._navigateToSummary();
          this._removeEditBar();
        }, 600);
      } else {
        console.log(`Validation failed for field "${field.name}"`);
        // indicate error
        bar.classList.add('shake');
        setTimeout(() => bar.classList.remove('shake'), 400);
      }
    };

    saveBtn.addEventListener('click', (e) => { e.preventDefault(); onComplete(); });
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log(`Edit canceled for field "${field.name}"`);
      this._removeEditBar();
      this._navigateToSummary();
    });

    // keyboard
    const keyHandler = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onComplete();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this._removeEditBar();
        this._navigateToSummary();
      }
    };
    field.addEventListener('keydown', keyHandler);
    bar.dataset.cleanup = 'true';
    bar._cleanup = () => {
      field.removeEventListener('keydown', keyHandler);
    };

    this.editBar = bar;
  }

  _removeEditBar() {
    if (this.editBar) {
      console.log('Edit bar removed');
      if (this.editBar._cleanup) this.editBar._cleanup();
      this.editBar.remove();
      this.editBar = null;
      clearHighlight(this.form);
    }
  }

  _navigateToSummary() {
    const reviewStep = this.summary ? this.summary.stepManager.steps.length - 1 : this.stepManager.steps.length - 1;
    this.goToStep(reviewStep);
  }

  // Attach global listeners once
  attachGlobalListeners() {
    if (this._globalListenersAttached) return;
    this._globalListenersAttached = true;

    // clear highlight on outside click
    document.addEventListener('click', (e) => {
      const editing = document.querySelector('.field-editing');
      if (editing && !editing.contains(e.target)) {
        clearHighlight(document);
      }
    });

    // clear on form submit
    this.form.addEventListener('submit', () => {
      clearHighlight(this.form);
    });
  }
}

// Ensure global listeners setup when script runs
document.addEventListener('DOMContentLoaded', () => {
  // No-op: listeners attached per FormManager instance
});
FormManager; 

// ---- core/Navigation.js ----
class Navigation {
  /**
   * @param {import('./StepManager.js').default} stepManager
   */
  constructor(stepManager) {
    this.stepManager = stepManager;
    // Ensure steps are discovered
    if (!this.stepManager.steps || !this.stepManager.steps.length) {
      this.stepManager.discoverSteps();
    }

    this.currentIndex = 0;
    this.form = this.stepManager.root; // root should be the form element

    this.createButtons();
    this.attachListeners();
    this.updateButtonVisibility();
  }

  /**
   * Creates navigation buttons inside the form if they don't already exist.
   */
  createButtons() {
    // Container
    this.navContainer = this.form.querySelector('.form-navigation');
    if (!this.navContainer) {
      this.navContainer = document.createElement('div');
      this.navContainer.className = 'form-navigation';
      this.form.appendChild(this.navContainer);
    }

    // Previous button
    this.prevButton = this.navContainer.querySelector('[data-nav="prev"]');
    if (!this.prevButton) {
      this.prevButton = document.createElement('button');
      this.prevButton.type = 'button';
      this.prevButton.setAttribute('data-nav', 'prev');
      this.prevButton.textContent = 'Previous';
      this.navContainer.appendChild(this.prevButton);
    }

    // Next button (acts as submit on last step)
    this.nextButton = this.navContainer.querySelector('[data-nav="next"]');
    if (!this.nextButton) {
      this.nextButton = document.createElement('button');
      this.nextButton.type = 'button';
      this.nextButton.setAttribute('data-nav', 'next');
      this.nextButton.textContent = 'Next';
      this.navContainer.appendChild(this.nextButton);
    }
  }

  /**
   * Attaches click listeners to navigation buttons.
   */
  attachListeners() {
    this.nextButton.addEventListener('click', (e) => {
      console.log('Navigation: Next button clicked');
      const lastIndex = this.stepManager.steps.length - 1;
      if (this.currentIndex < lastIndex) {
        e.preventDefault();
        this.handleNext();
      } // else allow default submit on last step
    });

    this.prevButton.addEventListener('click', (e) => {
      console.log('Navigation: Previous button clicked');
      if (this.currentIndex > 0) {
        e.preventDefault();
        this.handlePrevious();
      }
    });
  }

  /**
   * Move to next step if possible.
   */
  handleNext() {
    const nextIndex = this.currentIndex + 1;
    if (nextIndex < this.stepManager.steps.length) {
      this.currentIndex = nextIndex;
      this.stepManager.showStep(this.currentIndex);
      this.updateButtonVisibility();
    }
  }

  /**
   * Move to the previous step if possible.
   */
  handlePrevious() {
    const prevIndex = this.currentIndex - 1;
    if (prevIndex >= 0) {
      this.currentIndex = prevIndex;
      this.stepManager.showStep(this.currentIndex);
      this.updateButtonVisibility();
    }
  }

  /**
   * Update button visibility and labels according to current step.
   */
  updateButtonVisibility() {
    const lastIndex = this.stepManager.steps.length - 1;
    // Previous button visibility
    this.prevButton.style.display = this.currentIndex === 0 ? 'none' : 'inline-block';

    // Next button becomes submit on last step
    if (this.currentIndex === lastIndex) {
      this.nextButton.textContent = 'Submit';
      this.nextButton.type = 'submit';
    } else {
      this.nextButton.textContent = 'Next';
      this.nextButton.type = 'button';
    }
  }

  /** Trigger shake animation on nav container */
  triggerErrorShake() {
    if (!this.navContainer) return;
    this.navContainer.classList.add('shake');
    setTimeout(() => {
      this.navContainer.classList.remove('shake');
    }, 500);
  }
}
Navigation; 

// ---- core/StepManager.js ----
class StepManager {
  /**
   * @param {HTMLElement|Document} root - The root element to search within (defaults to document)
   */
  constructor(root = document) {
    this.root = root;
    /** @type {Array<{element: HTMLElement, index: number, wrappers: Array<{element: HTMLElement, answer: string | null}>}>} */
    this.steps = [];

    /**
     * Stores the answer value selected on previous step (set by ConditionalLogic).
     * Empty string means default wrapper.
     * @type {string}
     */
    this.selectedAnswer = '';
  }

  /**
   * Discovers all steps (elements with data-form="step") and their wrapper/answer elements.
   * @returns {Array} Array of step descriptor objects.
   */
  discoverSteps() {
    const stepElements = this.root.querySelectorAll('[data-form="step"]');
    this.steps = Array.from(stepElements).map((stepEl, index) => {
      const wrapperEls = stepEl.querySelectorAll('[data-answer]');
      const wrappers = Array.from(wrapperEls).map(wrapperEl => ({
        element: wrapperEl,
        answer: wrapperEl.getAttribute('data-answer')
      }));
      return {
        element: stepEl,
        index,
        wrappers
      };
    });
    return this.steps;
  }

  /**
   * Hides all discovered steps using display: none; If no steps discovered yet, it discovers first.
   */
  hideAllSteps() {
    if (!this.steps.length) {
      this.discoverSteps();
    }
    this.steps.forEach(step => {
      step.element.style.display = 'none';
    });
  }

  /**
   * Shows only the step at the given index (0-based) and hides all others.
   * @param {number} index - Index of the step to show.
   */
  showStep(index) {
    if (!this.steps.length) {
      this.discoverSteps();
    }
    this.steps.forEach(step => {
      step.element.style.display = step.index === index ? 'block' : 'none';
    });

    // Handle conditional wrappers
    const stepObj = this.steps[index];
    if (stepObj) {
      const answerVal = index === 0 ? '' : this.selectedAnswer || '';
      this.showWrapper(stepObj, answerVal);
    }
  }

  /**
   * Shows only the wrapper inside given step that matches answerValue.
   * If not found, shows the first wrapper.
   * @param {{wrappers: Array<{element: HTMLElement, answer: string|null}>}} stepObj
   * @param {string} answerValue
   */
  showWrapper(stepObj, answerValue = '') {
    if (!stepObj || !stepObj.wrappers) return;

    let shown = false;
    stepObj.wrappers.forEach(wrapper => {
      const match = (wrapper.answer || '') === answerValue;
      wrapper.element.style.display = match ? 'block' : 'none';
      if (match) shown = true;
    });

    // Fallback: if no wrapper matched, show the first one.
    if (!shown && stepObj.wrappers.length) {
      stepObj.wrappers[0].element.style.display = 'block';
    }
  }
}
StepManager; 

// ---- core/Validation.js ----
class Validation {
  /**
   * @param {HTMLFormElement} formElement
   */
  constructor(formElement) {
    this.form = formElement;
  }

  /**
   * Validate all required fields inside a step element.
   * @param {HTMLElement} stepElement
   * @returns {boolean} true if valid
   */
  validateStep(stepElement) {
    if (!stepElement) return true;
    this.clearErrors(stepElement);

    let valid = true;
    const requiredFields = stepElement.querySelectorAll('[required]');

    requiredFields.forEach(field => {
      if (!this.validateField(field)) {
        valid = false;
      }
    });
    return valid;
  }

  /**
   * Validate a single field.
   * @param {HTMLElement} fieldEl Input/select/textarea element
   * @returns {boolean}
   */
  validateField(fieldEl) {
    if (!(fieldEl instanceof HTMLInputElement || fieldEl instanceof HTMLSelectElement || fieldEl instanceof HTMLTextAreaElement)) return true;

    const type = fieldEl.type;
    const name = fieldEl.name;
    let isValid = true;

    if (type === 'radio') {
      // Radio group: at least one checked within this step
      const group = fieldEl.closest('[data-form="step"]').querySelectorAll(`input[type="radio"][name="${name}"]`);
      const checked = Array.from(group).some(r => r.checked);
      isValid = checked;
    } else if (type === 'checkbox') {
      const checked = fieldEl.checked;
      isValid = checked;
    } else {
      isValid = fieldEl.value.trim() !== '';
    }

    if (!isValid) {
      this.showError(fieldEl, 'This field is required');
    }
    return isValid;
  }

  /**
   * Show validation error message for a field.
   * @param {HTMLElement} fieldEl
   * @param {string} message
   */
  showError(fieldEl, message) {
    fieldEl.classList.add('field-error');
    // place message after field if not already
    let errorEl = fieldEl.parentElement.querySelector('.error-message');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'error-message';
      fieldEl.parentElement.appendChild(errorEl);
    }
    errorEl.textContent = message;
  }

  /**
   * Clear all error styles/messages inside a step
   * @param {HTMLElement} stepElement
   */
  clearErrors(stepElement) {
    if (!stepElement) return;
    stepElement.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
    stepElement.querySelectorAll('.error-message').forEach(el => el.remove());
  }
}
Validation; 

// ---- features/ConditionalLogic.js ----
class ConditionalLogic {
  /**
   * @param {import('../core/StepManager.js').default} stepManager
   */
  constructor(stepManager) {
    this.stepManager = stepManager;
    this.form = stepManager.root;

    this.attachListeners();
  }

  attachListeners() {
    const radios = this.form.querySelectorAll('input[type="radio"][data-go-to]');
    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          const answerValue = radio.dataset.goTo || '';
          console.log(`ConditionalLogic: selected answer value "${answerValue}"`);
          // Store selection on stepManager so it can be used by showStep
          this.stepManager.selectedAnswer = answerValue;
        }
      });
    });
  }
}
ConditionalLogic; 

// ---- features/Memory.js ----
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
Memory; 

// ---- features/Summary.js ----
class Summary {
  /**
   * @param {import('../core/StepManager.js').default} stepManager
   * @param {import('./Memory.js').default} memory
   * @param {HTMLElement} container
   */
  constructor(stepManager, memory, container) {
    this.stepManager = stepManager;
    this.memory = memory;
    this.container = container;
  }

  /**
   * Generate a summary object grouped by step.
   * @returns {Array<{name:string, items:Array<{label:string, value:any, fieldName:string}>}>}
   */
  generate() {
    const groups = [];
    const values = this.memory.data.values || {};

    // Build map stepIndex -> items
    Object.keys(values).forEach(fieldName => {
      const entry = values[fieldName];
      if (!entry.isVisible) return; // only include visible fields
      const stepIndex = entry.stepIndex ?? -1;
      const stepObj = this.stepManager.steps[stepIndex];
      const stepName = stepObj ? (stepObj.element.querySelector('h2,h3')?.textContent?.trim() || `Step ${stepIndex + 1}`) : `Step ${stepIndex + 1}`;

      // Find group or create
      let group = groups.find(g => g.index === stepIndex);
      if (!group) {
        group = { index: stepIndex, name: stepName, items: [] };
        groups.push(group);
      }

      const label = this._getFieldLabel(fieldName);
      group.items.push({ label, value: entry.value, fieldName });
    });

    // sort by step index
    groups.sort((a, b) => a.index - b.index);
    return groups;
  }

  /**
   * Render the summary into the container.
   * @param {HTMLElement} [container]
   */
  render(container = this.container) {
    if (!container) return;
    const summary = this.generate();
    container.innerHTML = '';

    summary.forEach(group => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'summary-group';

      const heading = document.createElement('h3');
      heading.textContent = group.name;
      groupDiv.appendChild(heading);

      group.items.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'summary-item';
        itemDiv.dataset.fieldName = item.fieldName;
        itemDiv.dataset.stepIndex = group.index;
        itemDiv.style.cursor = 'pointer';

        const labelSpan = document.createElement('span');
        labelSpan.className = 'label';
        labelSpan.textContent = item.label;

        const valueSpan = document.createElement('span');
        valueSpan.className = 'value';
        if (Array.isArray(item.value)) {
          valueSpan.textContent = item.value.join(', ');
        } else {
          valueSpan.textContent = item.value;
        }

        const editIcon = document.createElement('span');
        editIcon.className = 'edit-icon';
        editIcon.textContent = '✏️';

        itemDiv.appendChild(labelSpan);
        itemDiv.appendChild(valueSpan);
        itemDiv.appendChild(editIcon);
        groupDiv.appendChild(itemDiv);
      });

      container.appendChild(groupDiv);
    });

    // attach edit handlers
    this.attachEditHandlers();
  }

  /** Add click listeners to summary items */
  attachEditHandlers() {
    const items = this.container.querySelectorAll('.summary-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const fieldName = item.dataset.fieldName;
        const stepIndex = parseInt(item.dataset.stepIndex, 10);
        this.initiateFieldEdit(fieldName, stepIndex);
      });
    });
  }

  /** Dispatch event so FormManager can navigate/focus */
  initiateFieldEdit(fieldName, stepIndex) {
    this.editContext = { fieldName, stepIndex };
    const evt = new CustomEvent('editField', { detail: { fieldName } });
    this.stepManager.root.dispatchEvent(evt);
  }

  /**
   * Find step index and wrapper answer for a given field.
   * @param {string} fieldName
   * @returns {{stepIndex:number, wrapperAnswer:string|null}|null}
   */
  getFieldLocation(fieldName) {
    const fieldEl = this.stepManager.root.querySelector(`[name="${fieldName}"]`);
    if (!fieldEl) return null;
    const stepEl = fieldEl.closest('[data-form="step"]');
    if (!stepEl) return null;
    const stepObj = this.stepManager.steps.find(s => s.element === stepEl);
    const stepIndex = stepObj ? stepObj.index : -1;
    const wrapperEl = fieldEl.closest('[data-answer]');
    const wrapperAnswer = wrapperEl ? wrapperEl.getAttribute('data-answer') : null;
    return { stepIndex, wrapperAnswer };
  }

  /** Regenerate and re-render */
  update() {
    this.render();
  }

  _getFieldLabel(fieldName) {
    // Try to find label element with for attribute
    const fieldEl = this.stepManager.root.querySelector(`[name="${fieldName}"]`);
    if (fieldEl) {
      // Check placeholder
      if (fieldEl.placeholder) return fieldEl.placeholder;
      // Check closest label wrapper
      const labelEl = fieldEl.closest('label');
      if (labelEl) {
        // Remove input's text
        const cloned = labelEl.cloneNode(true);
        cloned.querySelectorAll('input,select,textarea').forEach(n => n.remove());
        const text = cloned.textContent?.trim();
        if (text) return text;
      }
      // Check label[for]
      if (fieldEl.id) {
        const explicit = this.stepManager.root.querySelector(`label[for="${fieldEl.id}"]`);
        if (explicit) return explicit.textContent?.trim();
      }
    }
    // fallback
    return fieldName;
  }
}
Summary; 

// ---- index.js ----


console.log('Multi-step form script loaded');

if (typeof document !== 'undefined') {
  const init = () => {
    const forms = document.querySelectorAll('[data-form="multistep"]');
    forms.forEach(form => {
      const manager = new FormManager(form);
      manager.init();

      console.log('FormManager initialized:', manager);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
} 

// ---- utils/fieldHighlight.js ----
/**
 * Utilities to highlight a field being edited.
 */
function clearHighlight(root = document) {
  root.querySelectorAll('.field-editing').forEach(el => el.classList.remove('field-editing'));
}
function highlightField(field, offset = 100) {
  if (!field) return;
  clearHighlight(field.ownerDocument);
  field.classList.add('field-editing');
  // focus without scrolling first
  try {
    field.focus({ preventScroll: true });
  } catch {
    field.focus();
  }
  // smooth scroll with offset
  const rect = field.getBoundingClientRect();
  const targetY = rect.top + window.scrollY - offset;
  window.scrollTo({ top: targetY, behavior: 'smooth' });
}

// expose globally for non-module use (e.g., in built IIFE)
if (typeof window !== 'undefined') {
  window.FieldHighlight = { highlightField, clearHighlight };
} 

})();