# setup.py
import octoprint.plugin

plugin_name = "octoprint_failuredetector"
plugin_version = "0.1.0"
plugin_description = "An AI-based print failure detector."
plugin_author = "Your Name"
plugin_author_email = "your_email@example.com"
plugin_url = "https://github.com/YourUsername/OctoPrint-FailureDetector" # <-- CHANGE THIS
plugin_license = "AGPLv3"

plugin_requires = ["tflite-runtime", "numpy", "Pillow", "requests"]

setup_args = octoprint.plugin.create_plugin_setup_parameters(
    identifier=plugin_name,
    name="AI Failure Detector",
    version=plugin_version,
    description=plugin_description,
    author=plugin_author,
    author_email=plugin_author_email,
    url=plugin_url,
    license=plugin_license,
    requires=plugin_requires,
    # We need to tell setup where to find the package data (our model)
    # This tells it to look for a MANIFEST.in file
    include_package_data=True
)

from setuptools import setup
setup(**setup_args)
