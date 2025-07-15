# __init__.py (Diagnostic Version 2 - Template Test)

import octoprint.plugin

# We add TemplatePlugin back to the list of inherited classes
class FailureDetectorPlugin(
    octoprint.plugin.StartupPlugin,
    octoprint.plugin.TemplatePlugin
):
    def on_after_startup(self):
        self._logger.info("--- FailureDetector DIAGNOSTIC 2 has loaded. Testing TemplatePlugin. ---")

    # This method is required by TemplatePlugin. We are keeping it empty for this test.
    def get_template_configs(self):
        return []

# --- All boilerplate is still required ---
__plugin_name__ = "AI Failure Detector"
__plugin_pythoncompat__ = ">=3,<4"

def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = FailureDetectorPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {}
