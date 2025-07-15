import StepManager from './StepManager.js';
import Navigation from './Navigation.js';
import Memory from '../features/Memory.js';
import Summary from '../features/Summary.js';
import Validation from './Validation.js';
import { highlightField, clearHighlight } from '../utils/fieldHighlight.js';

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

export default FormManager; 