# 1. Start from a small computer that already has Python 3.12
FROM python:3.12-slim

# 2. Work inside the /app folder
WORKDIR /app

# 3. Install the packages first (Docker caches this step)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Copy our code
COPY . .

# 5. Start the API (0.0.0.0 = reachable from outside the container)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]