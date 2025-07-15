// octoprint_failuredetector/static/js/failuredetector_settings.js

$(function() {
    function FailureDetectorSettingsViewModel(parameters) {
        var self = this;
        self.settings = parameters[0];

        self.testUrl = function() {
            var url = $("#settings_failuredetector input[data-bind*='webcam_snapshot_url']").val();
            var result_text = $("#test_result_text");

            if (!url) {
                result_text.text("Please enter a URL.").css("color", "orange");
                return;
            }

            result_text.text("Testing...").css("color", "deepskyblue");
            
            var tester = new Image();
            tester.onload = function() {
                result_text.text("Success! Image loaded.").css("color", "green");
            };
            tester.onerror = function() {
                result_text.text("Error! Could not load image.").css("color", "red");
            };
            tester.src = url + "?_t=" + new Date().getTime(); // Cache buster
        };
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorSettingsViewModel,
        dependencies: ["settingsViewModel"],
        elements: ["#settings_failuredetector"]
    });
});
