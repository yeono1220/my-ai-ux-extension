from sympy import *
import matplotlib.pyplot as plt
import numpy as np

# 행렬 및 초기값 세팅
A = Matrix([[1, 0, 1], [1, 1, 0], [-2, 0, -1]])
t = Symbol('t', real=True)
x0 = Matrix([1, 1, 1])

# Matrix Exponential 연산 및 출력
sol = simplify(exp(A*t)*x0)
print(sol)