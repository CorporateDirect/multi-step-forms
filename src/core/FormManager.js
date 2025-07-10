import StepManager from './StepManager.js';
import Navigation from './Navigation.js';
import ConditionalLogic from '../features/ConditionalLogic.js';
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

    // (navigation click handling moved to Navigation.js)
  }
}

// Ensure global listeners setup when script runs
document.addEventListener('DOMContentLoaded', () => {
  // No-op: listeners attached per FormManager instance
});

export default FormManager; 