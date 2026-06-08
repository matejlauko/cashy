ssh -L 15434:localhost:15434 matej@devboxik \
    "kubectl port-forward -n cashy svc/postgres 15434:5432"
