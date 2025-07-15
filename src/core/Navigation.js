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

export default Navigation; 