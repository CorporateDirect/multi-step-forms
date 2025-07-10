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

export default ConditionalLogic; 