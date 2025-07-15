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
    
    // Validate all steps for structure compatibility on initialization
    this.stepManager.steps.forEach((step, index) => {
      this._validateStructureCompatibility(step.element);
    });
    
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

    console.log(`🚀 [FormManager] STEP PROGRESSION: ${this.currentStep} → ${index}`);
    console.log(`📋 [FormManager] Navigation history: [${this.history.join(' → ')}] → ${index}`);

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
    const currentStepEl = this.stepManager.steps[this.currentStep].element;
    
    // Validate structure compatibility and show helpful warnings
    this._validateStructureCompatibility(currentStepEl);
    
    // Enhanced wrapper search with graceful fallbacks
    const wrapper = this._findWrapperGraceful(currentStepEl);

    if (!wrapper) {
      console.error('Could not find any wrapper element in the current step. Navigation halted.');
      return;
    }

    // Enhanced branching detection: check for data-branch="true" at multiple levels
    const isBranchingStep = this._detectBranchingStep(currentStepEl, wrapper);
    let targetAnswer = null;

    console.log(`🔍 [FormManager] Navigation analysis for step ${this.currentStep}:`);
    console.log(`🔍 [FormManager] Is branching step: ${isBranchingStep}`);
    
    if (isBranchingStep) {
      // This is a branching step. A radio choice is required.
      // Enhanced radio search: look within the entire current step DOM tree
      const conditionalChoice = this._findCheckedRadioWithGoTo(currentStepEl);
      if (conditionalChoice) {
        targetAnswer = conditionalChoice.getAttribute('data-go-to');
        console.log(`🔥 [FormManager] Branching navigation triggered. data-go-to: "${targetAnswer}"`);
      } else {
        // No choice made on a mandatory branching step.
        console.warn('⚠️ [FormManager] Branching step: No radio button selected. Navigation halted.');
        if (this.navigation.triggerErrorShake) this.navigation.triggerErrorShake();
        return;
      }
    } else {
      // This is a sequential step. Look for its target on the wrapper itself or nested elements.
      targetAnswer = this._findSequentialTarget(wrapper, currentStepEl);
      if (targetAnswer) {
        console.log(`➡️ [FormManager] Sequential navigation triggered. data-go-to: "${targetAnswer}"`);
      }
    }

    // If a target was determined, find and navigate to it.
    if (targetAnswer) {
      console.log(`🎯 [FormManager] Searching for target step with data-answer="${targetAnswer}"`);
      
      const targetStepIndex = this.stepManager.steps.findIndex((step, stepIndex) => {
        // Use graceful fallback to find the answer element
        const answerElement = this._findAnswerElementGraceful(step.element, targetAnswer);
        const found = answerElement !== null;
        console.log(`🔍 [FormManager]   Step ${stepIndex}: ${found ? '✅ CONTAINS' : '❌ does not contain'} data-answer="${targetAnswer}"`);
        return found;
      });

      if (targetStepIndex > -1) {
        // Store the selected answer for proper wrapper display
        this.stepManager.selectedAnswer = targetAnswer;
        console.log(`🎉 [FormManager] SUCCESS! data-go-to="${targetAnswer}" successfully targets data-answer="${targetAnswer}" in step ${targetStepIndex}`);
        alert(`🎉 Navigation Success!\n\ndata-go-to="${targetAnswer}" successfully found target data-answer="${targetAnswer}" in step ${targetStepIndex}`);
        this.goToStep(targetStepIndex);
      } else {
        console.error(`❌ [FormManager] Navigation failed: Could not find any step containing [data-answer="${targetAnswer}"]`);
        alert(`❌ Navigation Error!\n\ndata-go-to="${targetAnswer}" could not find matching data-answer="${targetAnswer}" in any step`);
      }
      return;
    }

    // Fallback for sequential steps that have no explicit target.
    console.log('🔄 [FormManager] Fallback navigation: Advancing to next step in DOM order.');
    this.goToStep(this.currentStep + 1);
  }

  /** Go back to the previous step */
  previousStep() {
    console.log(`⬅️ [FormManager] Going back from step ${this.currentStep} to step ${this.currentStep - 1}`);
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

  /**
   * Enhanced branching detection: checks for data-branch="true" at multiple levels
   * @param {HTMLElement} currentStepEl - The current step element
   * @param {HTMLElement} wrapper - The step wrapper element
   * @returns {boolean} - Whether this is a branching step
   */
  _detectBranchingStep(currentStepEl, wrapper) {
    // Check wrapper itself first
    if (wrapper.getAttribute('data-branch') === 'true') {
      return true;
    }
    
    // Check for any element with data-branch="true" within the current step
    const branchingElement = currentStepEl.querySelector('[data-branch="true"]');
    return branchingElement !== null;
  }

  /**
   * Enhanced radio search: finds checked radio with data-go-to within entire step DOM tree
   * @param {HTMLElement} currentStepEl - The current step element
   * @returns {HTMLElement|null} - The checked radio element or null
   */
  _findCheckedRadioWithGoTo(currentStepEl) {
    // Use graceful fallback for radio search with backward compatibility
    return this._findRadioGraceful(currentStepEl);
  }

  /**
   * Enhanced sequential target detection: finds data-go-to at wrapper or nested levels
   * @param {HTMLElement} wrapper - The step wrapper element
   * @param {HTMLElement} currentStepEl - The current step element
   * @returns {string|null} - The target answer or null
   */
  _findSequentialTarget(wrapper, currentStepEl) {
    // First check the wrapper itself
    if (wrapper.hasAttribute('data-go-to')) {
      return wrapper.getAttribute('data-go-to');
    }
    
    // Then check for any nested element with data-go-to (like step_items)
    const targetElement = currentStepEl.querySelector('[data-go-to]');
    if (targetElement) {
      return targetElement.getAttribute('data-go-to');
    }
    
    return null;
  }

  /**
   * BACKWARD COMPATIBILITY LAYER
   * These methods ensure existing simple forms continue to work without modification
   */

  /**
   * Detects the structure type of a step (simple vs nested)
   * @param {HTMLElement} stepElement - The step element to analyze
   * @returns {string} - 'simple' | 'nested' | 'mixed'
   */
  _detectStructureType(stepElement) {
    const wrapperWithAnswer = stepElement.querySelector('.step_wrapper[data-answer]');
    const nestedItems = stepElement.querySelectorAll('.step_item[data-answer]');
    
    if (wrapperWithAnswer && nestedItems.length > 0) {
      return 'mixed';
    } else if (nestedItems.length > 0) {
      return 'nested';
    } else if (wrapperWithAnswer) {
      return 'simple';
    }
    
    return 'simple'; // fallback to simple structure
  }

  /**
   * Graceful fallback for wrapper search - works with any structure type
   * @param {HTMLElement} stepElement - The step element to search within
   * @returns {HTMLElement|null} - The wrapper element or null
   */
  _findWrapperGraceful(stepElement) {
    // Primary search: look for .step_wrapper
    let wrapper = stepElement.querySelector('.step_wrapper');
    
    if (!wrapper) {
      // Fallback 1: look for any element with data-answer (legacy support)
      wrapper = stepElement.querySelector('[data-answer]');
      if (wrapper) {
        console.warn('FormManager: Using fallback wrapper detection. Consider updating to .step_wrapper structure.');
      }
    }
    
    if (!wrapper) {
      // Fallback 2: use the step element itself as wrapper (very legacy)
      wrapper = stepElement;
      console.warn('FormManager: No .step_wrapper found, using step element as wrapper. This is deprecated.');
    }
    
    return wrapper;
  }

  /**
   * Graceful fallback for finding data-answer elements
   * @param {HTMLElement} stepElement - The step element to search within
   * @param {string} targetAnswer - The answer value to find
   * @returns {HTMLElement|null} - The element with matching data-answer
   */
  _findAnswerElementGraceful(stepElement, targetAnswer) {
    // Primary search: comprehensive search at any level
    let answerElement = stepElement.querySelector(`[data-answer="${targetAnswer}"]`);
    
    if (!answerElement) {
      // Fallback: case-insensitive search (legacy support)
      const allAnswerElements = stepElement.querySelectorAll('[data-answer]');
      answerElement = Array.from(allAnswerElements).find(el => 
        el.getAttribute('data-answer').toLowerCase() === targetAnswer.toLowerCase()
      );
      
      if (answerElement) {
        console.warn(`FormManager: Found answer element using case-insensitive search. Consider using exact case: "${targetAnswer}"`);
      }
    }
    
    return answerElement;
  }

  /**
   * Graceful fallback for radio button search
   * @param {HTMLElement} stepElement - The step element to search within
   * @returns {HTMLElement|null} - The checked radio with data-go-to
   */
  _findRadioGraceful(stepElement) {
    // Primary search: look for radio with data-go-to
    let radio = stepElement.querySelector('input[type="radio"][data-go-to]:checked');
    
    if (!radio) {
      // Fallback: look for any checked radio and warn about missing data-go-to
      radio = stepElement.querySelector('input[type="radio"]:checked');
      if (radio && !radio.hasAttribute('data-go-to')) {
        console.warn('FormManager: Found checked radio without data-go-to attribute. Branching may not work correctly.');
        return null;
      }
    }
    
    return radio;
  }

  /**
   * Validates structure compatibility and provides helpful warnings
   * @param {HTMLElement} stepElement - The step element to validate
   */
  _validateStructureCompatibility(stepElement) {
    const structureType = this._detectStructureType(stepElement);
    const stepIndex = Array.from(this.stepManager.steps).findIndex(step => step.element === stepElement);
    
    switch (structureType) {
      case 'simple':
        // No warnings needed - this is the standard simple structure
        break;
        
      case 'nested':
        // This is the enhanced nested structure - all good
        break;
        
      case 'mixed':
        console.warn(`FormManager: Step ${stepIndex} has mixed structure (both .step_wrapper[data-answer] and .step_item[data-answer]). This may cause unexpected behavior.`);
        break;
        
      default:
        console.warn(`FormManager: Step ${stepIndex} has unusual structure. Consider using .step_wrapper containers.`);
    }
    
    // Check for deprecated patterns
    const legacyElements = stepElement.querySelectorAll('[data-target], [data-next]');
    if (legacyElements.length > 0) {
      console.warn(`FormManager: Step ${stepIndex} contains deprecated attributes (data-target, data-next). Consider migrating to data-go-to and data-answer.`);
    }
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

    // (navigation click handling moved to Navigation.js)
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
   * Initialize navigation without creating buttons - relies on existing Webflow elements
   */
  createButtons() {
    // No automatic button creation - use Webflow native elements only
    // Navigation handled entirely through data-form attributes in event delegation
  }

  /**
   * Attaches click listeners using event delegation for Webflow elements only.
   */
  attachListeners() {
    // Removed auto-generated button listeners - using only Webflow native elements
    
    // Delegate clicks on elements that use data-form="next-btn" or "back-btn"
    this.form.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-form]');
      if (!el) return;
      const attr = el.getAttribute('data-form');
      if (attr === 'next-btn') {
        e.preventDefault();
        this.handleNext();
      } else if (attr === 'back-btn') {
        e.preventDefault();
        this.handlePrevious();
      }

      // Skip-to support
      const skipTo = el.getAttribute('data-skip');
      if (skipTo) {
        e.preventDefault();
        const idx = this.stepManager.steps.findIndex(s => {
          const answerElement = s.element.querySelector(`[data-answer="${skipTo}"]`);
          return answerElement !== null;
        });
        if (idx >= 0) {
          this.currentIndex = idx;
          this.stepManager.showStep(idx);
          this.updateButtonVisibility();
        }
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
   * No longer needed - Webflow elements handle their own visibility and styling
   */
  updateButtonVisibility() {
    // Navigation visibility handled by Webflow elements and CSS
    // No auto-generated buttons to manipulate
  }

  /** 
   * Error feedback through console - no auto-generated nav container to shake
   */
  triggerErrorShake() {
    console.warn('Form validation failed - check required fields');
    // Error styling should be handled by Webflow's native form validation
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
    /** @type {Array<{element: HTMLElement, index: number, wrappers: Array<{element: HTMLElement, answer: string | null, type: string}>}>} */
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
   * Handles both simple (.step_wrapper with data-answer) and complex (.step_item with data-answer) structures.
   * @returns {Array} Array of step descriptor objects.
   */
  discoverSteps() {
    const stepElements = this.root.querySelectorAll('[data-form="step"]');
    this.steps = Array.from(stepElements).map((stepEl, index) => {
      // Find all elements with data-answer at any level within the step
      const wrapperEls = stepEl.querySelectorAll('[data-answer]');
      const wrappers = Array.from(wrapperEls).map(wrapperEl => {
        // Determine element type for better handling
        const isStepItem = wrapperEl.classList.contains('step_item');
        const isStepWrapper = wrapperEl.classList.contains('step_wrapper');
        
        return {
          element: wrapperEl,
          answer: wrapperEl.getAttribute('data-answer'),
          type: isStepItem ? 'step_item' : (isStepWrapper ? 'step_wrapper' : 'other')
        };
      });
      
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
    console.log(`[StepManager] 🔍 showStep called for index ${index}`);
    if (!this.steps.length) {
      this.discoverSteps();
    }
    
    console.log(`[StepManager] 👁️ Step visibility changes:`);
    this.steps.forEach(step => {
      const isVisible = step.index === index;
      step.element.style.display = isVisible ? 'flex' : 'none';
      console.log(`[StepManager]   Step ${step.index}: ${isVisible ? '✅ VISIBLE' : '❌ HIDDEN'}`);
    });

    // Handle conditional wrappers
    const stepObj = this.steps[index];
    if (stepObj) {
      const answerVal = index === 0 ? '' : this.selectedAnswer || '';
      console.log(`[StepManager] 🎯 Looking for wrapper with answer: "${answerVal}"`);
      this.showWrapper(stepObj, answerVal);
    }
  }

  /**
   * Shows only the wrapper inside given step that matches answerValue.
   * Handles both simple (.step_wrapper) and complex (.step_item) structures.
   * If not found, shows the first wrapper.
   * @param {{wrappers: Array<{element: HTMLElement, answer: string|null, type: string}>}} stepObj
   * @param {string} answerValue
   */
  showWrapper(stepObj, answerValue = '') {
    if (!stepObj || !stepObj.wrappers) return;

    console.log(`[StepManager] 🔧 showWrapper: searching for "${answerValue}" among ${stepObj.wrappers.length} wrappers`);
    
    let shown = false;
    let targetWrapper = null;

    // First pass: find the matching wrapper and hide all others
    stepObj.wrappers.forEach((wrapper, index) => {
      const match = (wrapper.answer || '') === answerValue;
      console.log(`[StepManager]   Wrapper ${index}: data-answer="${wrapper.answer || ''}" type="${wrapper.type}" ${match ? '✅ MATCH' : '❌ no match'}`);
      
      if (match) {
        targetWrapper = wrapper;
        wrapper.element.style.display = 'flex';
        shown = true;
        console.log(`[StepManager] 🎯 TARGET FOUND: Showing wrapper with data-answer="${wrapper.answer}"`);
      } else {
        wrapper.element.style.display = 'none';
      }
    });

    // Handle nested structure: ensure parent .step_wrapper is visible when showing .step_item
    if (shown && targetWrapper && targetWrapper.type === 'step_item') {
      const parentWrapper = targetWrapper.element.closest('.step_wrapper');
      if (parentWrapper) {
        parentWrapper.style.display = 'flex';
        console.log(`[StepManager] 🔗 Showing parent wrapper for step_item`);
      }
      
      // Hide sibling .step_item elements within the same parent
      const parentElement = targetWrapper.element.parentElement;
      if (parentElement) {
        const siblingStepItems = parentElement.querySelectorAll('.step_item');
        siblingStepItems.forEach(sibling => {
          if (sibling !== targetWrapper.element) {
            sibling.style.display = 'none';
          }
        });
      }
    }

    // Fallback: if no wrapper matched, show the first one
    if (!shown && stepObj.wrappers.length) {
      const firstWrapper = stepObj.wrappers[0];
      firstWrapper.element.style.display = 'flex';
      console.log(`[StepManager] ⚠️ FALLBACK: No match found, showing first wrapper with data-answer="${firstWrapper.answer}"`);
      
      // If first wrapper is a step_item, ensure its parent is visible
      if (firstWrapper.type === 'step_item') {
        const parentWrapper = firstWrapper.element.closest('.step_wrapper');
        if (parentWrapper) {
          parentWrapper.style.display = 'flex';
        }
      }
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
    // Allow purely informational steps to bypass validation
    if (stepElement.hasAttribute('data-form-no-input')) {
      return true;
    }
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
// This file is no longer used. The logic has been moved to FormManager.js 

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
      let stepName = `Step ${stepIndex + 1}`;
      if (stepObj) {
        if (stepObj.element.dataset.stepName) {
          stepName = stepObj.element.dataset.stepName;
        } else {
          const heading = stepObj.element.querySelector('h2,h3');
          if (heading && heading.textContent) stepName = heading.textContent.trim();
        }
      }

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
    // Custom override
    const fieldEl = this.stepManager.root.querySelector(`[name="${fieldName}"]`);
    if (fieldEl) {
      if (fieldEl.dataset.label) return fieldEl.dataset.label;
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
      // Expose for custom integrations/debugging
      form.__formManager = manager;
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