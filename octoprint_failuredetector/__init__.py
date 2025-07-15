# __init__.py (Gutted Diagnostic Version 1)

import octoprint.plugin

class FailureDetectorPlugin(octoprint.plugin.StartupPlugin):
    def on_after_startup(self):
        self._logger.info("--- FailureDetector GUTTED PLUGIN has loaded. All features are disabled. ---")

# --- All boilerplate is still required ---
__plugin_name__ = "AI Failure Detector"
__plugin_pythoncompat__ = ">=3,<4"

def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = FailureDetectorPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {}
