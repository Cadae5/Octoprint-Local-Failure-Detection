// octoprint_failuredetector/static/js/failuredetector.js (Diagnostic Dummy Version)

$(function() {
    function DummyFailureDetectorViewModel(parameters) {
        var self = this;
        // This ViewModel is intentionally left empty.
        // It exists only to fulfill the binding requirement without running any logic.
        console.log("FailureDetector DUMMY ViewModel has been loaded. All plugin UI functionality is disabled.");
    }

    // This is the only part that matters: we bind our empty ViewModel to our UI elements.
    OCTOPRINT_VIEWMODELS.push({
        construct: DummyFailureDetectorViewModel,
        dependencies: [], // No dependencies
        elements: ["#navbar_failuredetector", "#tab_failuredetector"]
    });
});
