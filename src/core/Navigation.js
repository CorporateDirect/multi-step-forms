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

export default Navigation; 