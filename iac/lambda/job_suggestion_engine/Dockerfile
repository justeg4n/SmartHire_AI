FROM public.ecr.aws/lambda/python:3.12 AS final

# Cài dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake model to /opt/ml/cross_encoder
RUN python -c "import os; os.environ['HF_HOME'] = '/tmp/hf_home'; from sentence_transformers import CrossEncoder; CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2', max_length=512).save('/opt/ml/cross_encoder')"

# Copy source (handler + modular helpers)
COPY js_config.py js_clients.py js_engine_core.py js_skill_semantics.py js_skill_canonical_ai.py skill_alias_store.py ${LAMBDA_TASK_ROOT}/
COPY job_suggestion_engine.py ${LAMBDA_TASK_ROOT}/
COPY appsync_notifier.py ${LAMBDA_TASK_ROOT}/

# Handler
CMD ["job_suggestion_engine.lambda_handler"]