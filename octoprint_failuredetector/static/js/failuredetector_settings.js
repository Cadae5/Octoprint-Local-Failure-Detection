// octoprint_failuredetector/static/js/failuredetector_settings.js (Repaired)

$(function() {
    function FailureDetectorSettingsViewModel(parameters) {
        var self = this;
        self.settings = parameters[0];

        self.testUrl = function() {
            // Get the URL reliably from the settings ViewModel
            var url = self.settings.settings.plugins.failuredetector.webcam_snapshot_url();
            var result_text = $("#test_result_text");

            if (!url) {
                result_text.text("Please enter a URL in the box above.").css("color", "orange");
                return;
            }

            result_text.text("Testing...").css("color", "deepskyblue");
            
            var tester = new Image();
            tester.onload = function() {
                result_text.text("Success! Image loaded correctly.").css("color", "green");
            };
            tester.onerror = function() {
                result_text.text("Error! Could not load image from that URL.").css("color", "red");
            };
            // Add a cache-buster to the URL
            tester.src = url + (url.indexOf("?") > -1 ? "&" : "?") + "_t=" + new Date().getTime();
        };
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorSettingsViewModel,
        dependencies: ["settingsViewModel"],
        elements: ["#settings_failuredetector"]
    });
});
