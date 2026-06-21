import yaml
import os


def load_config(path="/app/config.yaml"):
    if not os.path.exists(path):
        path = os.path.join(os.path.dirname(__file__), "config.yaml")
    with open(path) as f:
        return yaml.safe_load(f)
