FROM public.ecr.aws/lambda/python:3.12 AS final

# Cài dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake model to /opt/ml/cross_encoder
RUN python -c "import os; os.environ['HF_HOME'] = '/tmp/hf_home'; from sentence_transformers import CrossEncoder; CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2', max_length=512).save('/opt/ml/cross_encoder')"

# Copy source (handler + modular helpers)
COPY cr_config.py cr_clients.py cr_rds.py cr_dynamo.py cr_cross_encoder.py cr_scoring.py cr_skill_semantics.py cr_skill_normalize.py skill_alias_store.py ${LAMBDA_TASK_ROOT}/
COPY candidate_ranking_engine.py ${LAMBDA_TASK_ROOT}/
COPY appsync_notifier.py ${LAMBDA_TASK_ROOT}/

# Handler
CMD ["candidate_ranking_engine.lambda_handler"]