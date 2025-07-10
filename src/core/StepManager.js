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

export default StepManager; 