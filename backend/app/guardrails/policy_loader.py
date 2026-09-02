import os
import yaml
from typing import Dict, List

class PolicyLoader:
    def __init__(self, rules_dir: str = None):
        if rules_dir is None:
            # Locate relative to this file
            current_dir = os.path.dirname(os.path.abspath(__file__))
            rules_dir = os.path.join(current_dir, "rules")
        self.rules_dir = rules_dir
        self._cache: Dict[str, dict] = {}
        self.load_policies()

    def load_policies(self):
        self._cache.clear()
        if not os.path.exists(self.rules_dir):
            return
        for filename in os.listdir(self.rules_dir):
            if filename.endswith(".yaml") or filename.endswith(".yml"):
                filepath = os.path.join(self.rules_dir, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        data = yaml.safe_load(f)
                        if data and "jurisdiction_code" in data:
                            code = data["jurisdiction_code"]
                            self._cache[code] = data
                except Exception as e:
                    print(f"Failed to load policy from {filepath}: {e}")

    def get_policy(self, jurisdiction_code: str) -> dict:
        if jurisdiction_code not in self._cache:
            self.load_policies()
        return self._cache.get(jurisdiction_code, {})

    def list_active_jurisdictions(self) -> List[str]:
        if not self._cache:
            self.load_policies()
        return list(self._cache.keys())

# Global policy loader instance for general use
policy_loader = PolicyLoader()
