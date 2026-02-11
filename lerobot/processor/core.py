#!/usr/bin/env python

# Copyright 2025 The HuggingFace Inc. team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from __future__ import annotations

from enum import Enum
from typing import Any, TypeAlias, TypedDict, Union

import numpy as np

try:
    import torch
except ImportError:
    torch = None


class TransitionKey(str, Enum):
    """Keys for accessing EnvTransition dictionary components."""

    # TODO(Steven): Use consts
    OBSERVATION = "observation"
    ACTION = "action"
    REWARD = "reward"
    DONE = "done"
    TRUNCATED = "truncated"
    INFO = "info"
    COMPLEMENTARY_DATA = "complementary_data"


# Type aliases - use Any when torch is not available
if torch is not None:
    PolicyAction: TypeAlias = torch.Tensor
    TorchTensor: TypeAlias = torch.Tensor
else:
    PolicyAction: TypeAlias = Any
    TorchTensor: TypeAlias = Any
RobotAction: TypeAlias = dict[str, Any]
EnvAction: TypeAlias = np.ndarray
RobotObservation: TypeAlias = dict[str, Any]


EnvTransition = TypedDict(
    "EnvTransition",
    {
        TransitionKey.OBSERVATION.value: Union[RobotObservation, None],
        TransitionKey.ACTION.value: Union[PolicyAction, RobotAction, EnvAction, None],
        TransitionKey.REWARD.value: Union[float, TorchTensor, None],
        TransitionKey.DONE.value: Union[bool, TorchTensor, None],
        TransitionKey.TRUNCATED.value: Union[bool, TorchTensor, None],
        TransitionKey.INFO.value: Union[dict[str, Any], None],
        TransitionKey.COMPLEMENTARY_DATA.value: Union[dict[str, Any], None],
    },
)
